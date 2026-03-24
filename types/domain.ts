export type WorkspaceRole = "owner" | "admin" | "member" | "viewer";
export type WorkspaceKind = "personal" | "shared";
export type WorkspaceInvitationStatus = "pending" | "accepted" | "declined" | "expired" | "revoked";
export type MovementStatus = "planned" | "pending" | "posted" | "voided";
export type MovementType =
  | "expense"
  | "income"
  | "transfer"
  | "subscription_payment"
  | "obligation_opening"
  | "obligation_payment"
  | "refund"
  | "adjustment";
export type ObligationDirection = "receivable" | "payable";
export type ObligationOriginType = "cash_loan" | "sale_financed" | "purchase_financed" | "manual";
export type ObligationStatus = "draft" | "active" | "paid" | "cancelled" | "defaulted";
export type ObligationEventType =
  | "opening"
  | "principal_increase"
  | "principal_decrease"
  | "payment"
  | "interest"
  | "fee"
  | "discount"
  | "adjustment"
  | "writeoff";
export type ObligationShareStatus = "pending" | "accepted" | "declined" | "revoked";
export type SubscriptionFrequency = "daily" | "weekly" | "monthly" | "quarterly" | "yearly" | "custom";
export type SubscriptionStatus = "active" | "paused" | "cancelled";
export type CategoryKind = "expense" | "income" | "both";
export type CounterpartyType = "person" | "company" | "merchant" | "service" | "bank" | "other";
export type CounterpartyRoleType =
  | "client"
  | "supplier"
  | "lender"
  | "borrower"
  | "bank"
  | "service_provider"
  | "other";
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | { [key: string]: JsonValue }
  | JsonValue[];

export type UserProfile = {
  id: string;
  fullName: string;
  email: string;
  initials: string;
  baseCurrencyCode: string;
  timezone: string;
};

export type Workspace = {
  id: number;
  name: string;
  kind: WorkspaceKind;
  role: WorkspaceRole;
  description: string;
  baseCurrencyCode: string;
  isDefaultWorkspace?: boolean;
  isArchived?: boolean;
  joinedAt?: string | null;
  ownerUserId?: string;
};

export type WorkspaceMemberSummary = {
  userId: string;
  fullName: string;
  email?: string | null;
  role: WorkspaceRole;
  isDefaultWorkspace: boolean;
  joinedAt: string;
  isCurrentUser: boolean;
};

export type WorkspaceInvitationSummary = {
  id: number;
  workspaceId: number;
  invitedByUserId: string;
  invitedUserId: string;
  invitedEmail: string;
  invitedDisplayName?: string | null;
  invitedByDisplayName?: string | null;
  role: WorkspaceRole;
  status: WorkspaceInvitationStatus;
  token: string;
  note?: string | null;
  acceptedAt?: string | null;
  respondedAt?: string | null;
  lastSentAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type WorkspaceCollaborationSummary = {
  workspace: Workspace;
  requesterRole: WorkspaceRole;
  canManageMembers: boolean;
  members: WorkspaceMemberSummary[];
  invitations: WorkspaceInvitationSummary[];
};

export type WorkspaceInvitePreview = {
  id: number;
  name: string;
  kind: WorkspaceKind;
  description: string;
  baseCurrencyCode: string;
  ownerUserId?: string;
};

export type WorkspaceInvitationDetails = {
  workspace: WorkspaceInvitePreview;
  invitation: WorkspaceInvitationSummary;
};

export type ExchangeRateSummary = {
  fromCurrencyCode: string;
  toCurrencyCode: string;
  rate: number;
  effectiveAt: string;
};

export type AccountSummary = {
  id: number;
  workspaceId: number;
  name: string;
  type: string;
  currencyCode: string;
  openingBalance: number;
  currentBalance: number;
  currentBalanceInBaseCurrency?: number | null;
  includeInNetWorth: boolean;
  lastActivity: string;
  color: string;
  icon: string;
  isArchived: boolean;
};

/** Catálogo en snapshot (pickers); campos extra opcionales para compatibilidad. */
export type CategorySummary = {
  id: number;
  name: string;
  kind: CategoryKind;
  isActive: boolean;
  workspaceId?: number;
  parentId?: number | null;
  parentName?: string | null;
  color?: string | null;
  icon?: string | null;
  sortOrder?: number;
  isSystem?: boolean;
};

/** Movimientos publicados con categoría (analíticas desde snapshot). */
export type CategoryPostedMovement = {
  id: number;
  categoryId: number;
  occurredAt: string;
  sourceAmount: number | null;
  destinationAmount: number | null;
};

export type CategoryOverview = CategorySummary & {
  workspaceId: number;
  parentId?: number | null;
  parentName?: string | null;
  color?: string | null;
  icon?: string | null;
  sortOrder: number;
  isSystem: boolean;
  movementCount: number;
  subscriptionCount: number;
  lastActivityAt?: string | null;
};

export type BudgetScopeKind = "general" | "category" | "account" | "category_account";

export type AttachmentEntityType = "movement" | "obligation" | "subscription";

export type BudgetOverview = {
  id: number;
  workspaceId: number;
  createdByUserId?: string | null;
  updatedByUserId?: string | null;
  name: string;
  periodStart: string;
  periodEnd: string;
  currencyCode: string;
  categoryId?: number | null;
  categoryName?: string | null;
  accountId?: number | null;
  accountName?: string | null;
  scopeKind: BudgetScopeKind;
  scopeLabel: string;
  limitAmount: number;
  spentAmount: number;
  remainingAmount: number;
  usedPercent: number;
  alertPercent: number;
  movementCount: number;
  rolloverEnabled: boolean;
  notes?: string | null;
  isActive: boolean;
  isNearLimit: boolean;
  isOverLimit: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CounterpartySummary = {
  id: number;
  name: string;
  type: CounterpartyType;
  isArchived: boolean;
  /** Presente cuando viene del snapshot / detalle */
  phone?: string | null;
  email?: string | null;
  documentNumber?: string | null;
  notes?: string | null;
};

export type CounterpartyOverview = CounterpartySummary & {
  workspaceId: number;
  roles: CounterpartyRoleType[];
  receivableCount: number;
  receivablePrincipalTotal: number;
  receivablePendingTotal: number;
  payableCount: number;
  payablePrincipalTotal: number;
  payablePendingTotal: number;
  netPendingAmount: number;
  movementCount: number;
  inflowTotal: number;
  outflowTotal: number;
  netFlowAmount: number;
  lastActivityAt?: string | null;
};

export type MovementRecord = {
  id: number;
  workspaceId: number;
  movementType: MovementType;
  status: MovementStatus;
  description: string;
  notes?: string | null;
  category: string;
  categoryId?: number | null;
  counterparty: string;
  counterpartyId?: number | null;
  occurredAt: string;
  sourceAccountId: number | null;
  sourceAccountName: string | null;
  sourceCurrencyCode?: string | null;
  sourceAmount: number | null;
  sourceAmountInBaseCurrency?: number | null;
  destinationAccountId: number | null;
  destinationAccountName: string | null;
  destinationCurrencyCode?: string | null;
  destinationAmount: number | null;
  destinationAmountInBaseCurrency?: number | null;
  fxRate?: number | null;
  obligationId?: number | null;
  subscriptionId?: number | null;
  metadata?: JsonValue | null;
};

export type ObligationEventSummary = {
  id: number;
  eventType: ObligationEventType;
  eventDate: string;
  amount: number;
  installmentNo?: number | null;
  reason?: string | null;
  description?: string | null;
  notes?: string | null;
  movementId?: number | null;
  createdByUserId?: string | null;
  metadata?: JsonValue | null;
};

export type ObligationShareSummary = {
  id: number;
  workspaceId: number;
  obligationId: number;
  ownerUserId: string;
  invitedByUserId: string;
  invitedUserId: string;
  ownerDisplayName?: string | null;
  invitedDisplayName?: string | null;
  invitedEmail: string;
  status: ObligationShareStatus;
  token: string;
  message?: string | null;
  acceptedAt?: string | null;
  respondedAt?: string | null;
  lastSentAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ObligationSummary = {
  id: number;
  workspaceId: number;
  title: string;
  direction: ObligationDirection;
  originType: ObligationOriginType;
  counterparty: string;
  counterpartyId: number | null;
  settlementAccountId?: number | null;
  settlementAccountName?: string | null;
  status: ObligationStatus;
  currencyCode: string;
  principalAmount: number;
  principalAmountInBaseCurrency?: number | null;
  currentPrincipalAmount?: number | null;
  currentPrincipalAmountInBaseCurrency?: number | null;
  pendingAmount: number;
  pendingAmountInBaseCurrency?: number | null;
  progressPercent: number;
  startDate: string;
  dueDate: string | null;
  installmentAmount?: number | null;
  installmentCount?: number | null;
  interestRate?: number | null;
  description?: string | null;
  notes?: string | null;
  paymentCount: number;
  lastPaymentDate?: string | null;
  installmentLabel: string;
  events: ObligationEventSummary[];
};

export type SharedObligationSummary = ObligationSummary & {
  viewerMode: "shared_viewer";
  share: ObligationShareSummary;
};

export type ObligationShareInviteDetails = {
  share: ObligationShareSummary;
  title: string;
  direction: ObligationDirection;
  originType: ObligationOriginType;
  status: ObligationStatus;
  counterparty: string;
  settlementAccountName?: string | null;
  currencyCode: string;
  principalAmount: number;
  currentPrincipalAmount: number;
  pendingAmount: number;
  progressPercent: number;
  startDate: string;
  dueDate?: string | null;
  installmentAmount?: number | null;
  installmentCount?: number | null;
  interestRate?: number | null;
  description?: string | null;
  notes?: string | null;
  paymentCount: number;
};

/** Movimientos publicados vinculados a suscripciones (snapshot, sin APIs extra). */
export type SubscriptionPostedMovement = {
  id: number;
  subscriptionId: number;
  occurredAt: string;
  sourceAmount: number | null;
  destinationAmount: number | null;
};

export type SubscriptionSummary = {
  id: number;
  workspaceId: number;
  name: string;
  vendorPartyId?: number | null;
  vendor: string;
  accountId?: number | null;
  categoryId?: number | null;
  categoryName?: string | null;
  status: SubscriptionStatus;
  amount: number;
  amountInBaseCurrency?: number | null;
  currencyCode: string;
  frequency: SubscriptionFrequency;
  frequencyLabel: string;
  intervalCount: number;
  dayOfMonth?: number | null;
  dayOfWeek?: number | null;
  startDate: string;
  nextDueDate: string;
  endDate?: string | null;
  remindDaysBefore: number;
  accountName?: string | null;
  autoCreateMovement: boolean;
  description?: string | null;
  notes?: string | null;
};

export type NotificationItem = {
  id: number;
  title: string;
  body: string;
  status: "pending" | "sent" | "read" | "failed";
  scheduledFor: string;
  kind: string;
  channel?: string;
  readAt?: string | null;
};

/** Invitaciones obligation_shares pendientes para el usuario actual (lista en Notificaciones). */
export type PendingObligationShareInviteItem = {
  id: number;
  workspaceId: number;
  obligationId: number;
  token: string;
  ownerDisplayName: string | null;
  invitedEmail: string;
  message: string | null;
  updatedAt: string;
  obligationTitle: string | null;
};

export type AttachmentSummary = {
  id: number;
  workspaceId: number;
  entityType: AttachmentEntityType;
  entityId: number;
  bucketName: string;
  filePath: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  width?: number | null;
  height?: number | null;
  uploadedByUserId: string;
  createdAt: string;
};

export type UserEntitlementSummary = {
  userId: string;
  planCode: "free" | "pro";
  proAccessEnabled: boolean;
  billingStatus?: string | null;
  billingProvider?: string | null;
  providerCustomerId?: string | null;
  providerSubscriptionId?: string | null;
  currentPeriodStart?: string | null;
  currentPeriodEnd?: string | null;
  cancelAtPeriodEnd: boolean;
  manualOverride: boolean;
};

export type ActivityItem = {
  id: number;
  workspaceId: number;
  actor: string;
  action: string;
  entity: string;
  description: string;
  createdAt: string;
};
