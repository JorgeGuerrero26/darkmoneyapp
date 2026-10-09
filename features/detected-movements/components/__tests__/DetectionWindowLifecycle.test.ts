import React from "react";
import { View } from "react-native";
import { QuickDetectedMovementEntry } from "../../../../components/domain/QuickDetectedMovementEntry";
import { BottomSheet } from "../../../../components/ui/BottomSheet";

const { create, act } = require("react-test-renderer");
const mockMount = jest.fn(), mockUnmount = jest.fn();
let mockReview: any;
jest.mock("../../hooks/useDetectedMovementReview", () => ({ useDetectedMovementReview: () => mockReview }));
jest.mock("expo-router", () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock("../../../../hooks/useToast", () => ({ useToast: () => ({ showErrorToast: jest.fn() }) }));
jest.mock("../../../../components/ui/BottomSheet", () => ({ BottomSheet: ({ visible, title, children, footer }: any) => {
  require("react").useEffect(() => { mockMount(); return () => mockUnmount(); }, []);
  return require("react").createElement(require("react-native").View, { visible, title }, children, footer);
} }));
jest.mock("../../../../components/ui/DetailFieldRow", () => ({ DetailFieldRow: () => null }));
jest.mock("../../../../components/ui/DetailActionBar", () => ({ DetailActionBar: () => null }));
jest.mock("../../../../components/ui/Button", () => ({ Button: () => null }));
jest.mock("../../../../components/ui/TextField", () => ({ TextField: () => null }));
jest.mock("../../../../components/ui/SearchableSelectSheet", () => ({ SearchableSelectSheet: () => null }));
jest.mock("../../../../components/ui/DateTimeSheet", () => ({ DateTimeSheet: () => null }));
jest.mock("../../../../components/ui/InlineFormSheet", () => ({ InlineFormSheet: () => null }));
jest.mock("../DetectedMovementExtras", () => ({ DetectedMovementExtras: () => null }));
jest.mock("../../../movements/components/form/SplitCategoriesSheet", () => ({ SplitCategoriesSheet: () => null }));

let renderer: ReturnType<typeof create>;
const props = { visible: true, suggestionId: 7, onClose: jest.fn() };
beforeEach(() => {
  jest.clearAllMocks();
  mockReview = { suggestion: { id: 7, status: "pending", currencyCode: "PEN" }, activeAccounts: [], categories: [],
    emailProAccess: { data: true }, initialized: true, draft: {}, amount: "15.00", date: "2026-10-09", time: "10:00",
    missing: [], movementType: "expense", busy: false, suggestionQuery: {} };
});
afterEach(async () => { if (renderer) await act(async () => renderer.unmount()); });

it.each(["registered", "discarded", "duplicate"])("el estado %s y el siguiente pendiente usan el mismo Modal nativo", async status => {
  await act(async () => { renderer = create(React.createElement(QuickDetectedMovementEntry, props)); });
  const sheet = renderer.root.findByType(BottomSheet);
  mockReview = { ...mockReview, suggestion: { ...mockReview.suggestion, status } };
  await act(async () => renderer.update(React.createElement(QuickDetectedMovementEntry, props)));
  expect(renderer.root.findByType(BottomSheet)).toBe(sheet);
  mockReview = { ...mockReview, suggestion: { id: 8, status: "pending", currencyCode: "PEN" } };
  await act(async () => renderer.update(React.createElement(QuickDetectedMovementEntry, { ...props, suggestionId: 8 })));
  expect(renderer.root.findByType(BottomSheet)).toBe(sheet);
  expect(sheet.props.visible).toBe(true);
  expect(mockMount).toHaveBeenCalledTimes(1);
  expect(mockUnmount).not.toHaveBeenCalled();
});

it("cerrar tras guardar conserva el Modal con visible=false y permite abrirlo de nuevo", async () => {
  await act(async () => { renderer = create(React.createElement(QuickDetectedMovementEntry, props)); });
  const sheet = renderer.root.findByType(BottomSheet);
  mockReview = { ...mockReview, suggestion: { ...mockReview.suggestion, status: "registered" } };
  await act(async () => renderer.update(React.createElement(QuickDetectedMovementEntry, { ...props, visible: false })));
  expect(renderer.root.findByType(BottomSheet)).toBe(sheet);
  expect(sheet.props.visible).toBe(false);
  mockReview = { ...mockReview, suggestion: { id: 8, status: "pending", currencyCode: "PEN" } };
  await act(async () => renderer.update(React.createElement(QuickDetectedMovementEntry, { ...props, suggestionId: 8 })));
  expect(renderer.root.findByType(BottomSheet)).toBe(sheet);
  expect(sheet.props.visible).toBe(true);
  expect(mockUnmount).not.toHaveBeenCalled();
});

it("carga, error y aviso PRO cambian el contenido sin reemplazar la ventana", async () => {
  await act(async () => { renderer = create(React.createElement(QuickDetectedMovementEntry, props)); });
  const sheet = renderer.root.findByType(BottomSheet);
  for (const update of [{ suggestion: null }, { dataError: true }, { dataError: false, isPendingEmail: true, emailProAccess: { data: false } }]) {
    mockReview = { ...mockReview, ...update };
    await act(async () => renderer.update(React.createElement(QuickDetectedMovementEntry, props)));
    expect(renderer.root.findByType(BottomSheet)).toBe(sheet);
    expect(renderer.root.findAllByType(BottomSheet)).toHaveLength(1);
  }
  expect(mockMount).toHaveBeenCalledTimes(1);
  expect(mockUnmount).not.toHaveBeenCalled();
  expect(renderer.root.findAllByType(View).length).toBeGreaterThan(0);
});

it("omitir desde la lista mantiene la lista y su confirmación dentro del mismo Modal", async () => {
  const listProps = { ...props, list: React.createElement(View, { testID: "pending-list" }), listOverlay: React.createElement(View, { testID: "omit-confirmation" }), listHeaderAction: React.createElement(View, { testID: "omit-all" }) };
  await act(async () => { renderer = create(React.createElement(QuickDetectedMovementEntry, listProps)); });
  const sheet = renderer.root.findByType(BottomSheet);
  mockReview = { ...mockReview, suggestion: { ...mockReview.suggestion, status: "discarded" } };
  await act(async () => renderer.update(React.createElement(QuickDetectedMovementEntry, listProps)));
  expect(renderer.root.findByType(BottomSheet)).toBe(sheet);
  expect(sheet.props.title).toBe("Por revisar");
  expect(sheet.props.overlay).toBe(listProps.listOverlay);
  expect(sheet.props.headerAction).toBe(listProps.listHeaderAction);
  expect(mockUnmount).not.toHaveBeenCalled();
});
