export type Identifier = string;
export type JsonRecord = Record<string, unknown>;
export type Query = Record<string, string | number | boolean | undefined>;

export interface AuthOperations {
  signup(input: JsonRecord): Promise<JsonRecord>;
  login(input: JsonRecord): Promise<JsonRecord>;
  forgotPassword(input: JsonRecord): Promise<{ accepted: true }>;
  me(): Promise<JsonRecord>;
}

export interface DepartmentOperations {
  list(query: Query): Promise<JsonRecord>;
  create(input: JsonRecord): Promise<JsonRecord>;
  update(input: JsonRecord): Promise<JsonRecord>;
}

export interface CategoryOperations extends DepartmentOperations {}

export interface EmployeeOperations {
  list(query: Query): Promise<JsonRecord>;
  update(id: Identifier, input: JsonRecord): Promise<JsonRecord>;
  deactivate(id: Identifier, input: JsonRecord): Promise<JsonRecord>;
}

export interface AssetOperations {
  list(query: Query): Promise<JsonRecord>;
  create(input: JsonRecord): Promise<JsonRecord>;
  get(id: Identifier): Promise<JsonRecord>;
  update(id: Identifier, input: JsonRecord): Promise<JsonRecord>;
}

export interface AllocationOperations {
  create(input: JsonRecord): Promise<JsonRecord>;
  returnAsset(id: Identifier, input: JsonRecord): Promise<JsonRecord>;
}

export interface TransferOperations {
  create(input: JsonRecord): Promise<JsonRecord>;
  approve(id: Identifier, input: JsonRecord): Promise<JsonRecord>;
  reject(id: Identifier, input: JsonRecord): Promise<JsonRecord>;
}

export interface BookingOperations {
  list(query: Query): Promise<JsonRecord>;
  create(input: JsonRecord): Promise<JsonRecord>;
  cancel(id: Identifier, input: JsonRecord): Promise<JsonRecord>;
  checkin(id: Identifier, input?: JsonRecord): Promise<JsonRecord>;
}

export interface MaintenanceOperations {
  create(input: JsonRecord): Promise<JsonRecord>;
  approve(id: Identifier, input: JsonRecord): Promise<JsonRecord>;
  reject(id: Identifier, input: JsonRecord): Promise<JsonRecord>;
  assignTechnician(id: Identifier, input: JsonRecord): Promise<JsonRecord>;
  start(id: Identifier, input: JsonRecord): Promise<JsonRecord>;
  resolve(id: Identifier, input: JsonRecord): Promise<JsonRecord>;
}

export interface AuditOperations {
  create(input: JsonRecord): Promise<JsonRecord>;
  assignAuditors(id: Identifier, input: JsonRecord): Promise<JsonRecord>;
  updateFindings(id: Identifier, input: JsonRecord): Promise<JsonRecord>;
  close(id: Identifier, input: JsonRecord): Promise<JsonRecord>;
  discrepancyReport(id: Identifier): Promise<JsonRecord>;
}

export interface ReportOperations {
  utilization(query: Query): Promise<JsonRecord>;
  maintenanceFrequency(query: Query): Promise<JsonRecord>;
  departmentAllocationSummary(query: Query): Promise<JsonRecord>;
  bookingHeatmap(query: Query): Promise<JsonRecord>;
  ghostRisk(query: Query): Promise<JsonRecord>;
  export(query: Query): Promise<unknown>;
}

export interface NotificationOperations {
  list(query: Query): Promise<JsonRecord>;
  markRead(id: Identifier): Promise<JsonRecord>;
}

export interface ActivityOperations {
  list(query: Query): Promise<JsonRecord>;
}

export interface DashboardOperations {
  kpis(query: Query): Promise<JsonRecord>;
}

