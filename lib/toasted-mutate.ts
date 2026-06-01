import { humanizeError } from "./errors";

type ToastTone = "success" | "error" | "info";

type ShowToast = (message: string, tone?: ToastTone) => void;

type RunMutation<TInput, TResult> = (input: TInput) => Promise<TResult>;

type SuccessMessage<TResult> = string | ((result: TResult) => string);

type ToastedMutateOptions<TInput, TResult> = {
  mutate: RunMutation<TInput, TResult>;
  input: TInput;
  showToast: ShowToast;
  successMessage: SuccessMessage<TResult>;
  onSuccess?: (result: TResult) => void | Promise<void>;
};

/**
 * Run a mutation and surface the standard success/error toast.
 * Returns `true` if the mutation succeeded.
 *
 * Why: every handler in obligation/[id].tsx repeated the same try/await/catch
 * with humanizeError + showToast. This centralizes that pattern so handlers
 * only own their business state transitions (closing modals, resetting
 * selection, etc.).
 */
export async function toastedMutate<TInput, TResult>(
  options: ToastedMutateOptions<TInput, TResult>,
): Promise<boolean> {
  try {
    const result = await options.mutate(options.input);
    const message =
      typeof options.successMessage === "function"
        ? options.successMessage(result)
        : options.successMessage;
    options.showToast(message, "success");
    if (options.onSuccess) {
      await options.onSuccess(result);
    }
    return true;
  } catch (err: unknown) {
    options.showToast(humanizeError(err), "error");
    return false;
  }
}
