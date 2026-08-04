/**
 * Envoltura defensiva de expo-speech-recognition.
 *
 * Por qué existe: `expo-speech-recognition` resuelve su módulo nativo con
 * `requireNativeModule("ExpoSpeechRecognition")` en el cuerpo del módulo, y esa
 * llamada LANZA si el nativo no está enlazado en el binario. Un import estático
 * del paquete tumba entonces la pantalla entera al evaluarse, antes de
 * renderizar nada.
 *
 * Pasó de verdad: el .ipa 1.0.8 del iPhone se compiló sin el pod (prebuild sin
 * `pod install` detrás). El Info.plist traía los textos de permiso pero el
 * binario no traía el módulo, así que abrir el asistente cerraba la app.
 *
 * Aquí se resuelve una sola vez al cargar y se degrada a no-ops: sin dictado,
 * pero con el asistente usable. `isDictationAvailable` permite esconder el
 * botón del micrófono en vez de ofrecer algo que no va a funcionar.
 */

type PermissionResult = { granted: boolean };

type SpeechRecognitionModuleLike = {
  requestPermissionsAsync: () => Promise<PermissionResult>;
  start: (options: Record<string, unknown>) => void;
  stop: () => void;
};

/** Solo la forma que consume la app; el evento real trae bastante más. */
type SpeechRecognitionEventLike = { results?: { transcript?: string }[] };

type SpeechRecognitionEventHook = (
  event: string,
  handler: (payload: SpeechRecognitionEventLike) => void,
) => void;

let nativeModule: SpeechRecognitionModuleLike | null = null;
let nativeEventHook: SpeechRecognitionEventHook | null = null;

try {
  // require() y no import: el import estático es justamente lo que revienta.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require("expo-speech-recognition");
  if (mod?.ExpoSpeechRecognitionModule && mod?.useSpeechRecognitionEvent) {
    nativeModule = mod.ExpoSpeechRecognitionModule;
    nativeEventHook = mod.useSpeechRecognitionEvent;
  }
} catch {
  nativeModule = null;
  nativeEventHook = null;
}

export const isDictationAvailable = nativeModule !== null && nativeEventHook !== null;

export const ExpoSpeechRecognitionModule: SpeechRecognitionModuleLike = nativeModule ?? {
  requestPermissionsAsync: async () => ({ granted: false }),
  start: () => {},
  stop: () => {},
};

/**
 * Identidad estable entre renders (se decide una vez al cargar el módulo), así
 * que llamarlo incondicionalmente respeta las reglas de hooks aunque el nativo
 * falte.
 */
export const useSpeechRecognitionEvent: SpeechRecognitionEventHook =
  nativeEventHook ?? (() => {});
