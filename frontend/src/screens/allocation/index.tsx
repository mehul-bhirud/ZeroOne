import { useState, useEffect, type FormEvent } from "react";
import {
  Button,
  EmptyState,
  ScreenShell,
  Input,
  FormField,
  ErrorSummary,
  Toast,
  Skeleton
} from "../../design-system";
import {
  createAllocation,
  returnAllocation,
  createTransferRequest,
  approveTransferRequest,
  rejectTransferRequest,
  getAssetsList,
  getEmployeesList,
  getDepartmentsList,
  getTransferRequests
} from "./api";
import { getAssetById } from "../asset-registry/api";

export function AllocationScreen() {
  const [activeTab, setActiveTab] = useState<"allocate" | "returns" | "transfers">("allocate");

  return (
    <ScreenShell title="Allocation and custody" description="Assign assets to employees or departments, process returns, and approve transfers.">
      <div className="tabs" style={{ display: "flex", gap: 24, borderBottom: "1px solid #1E262F", paddingBottom: 16, marginBottom: 24 }}>
        <button className={`tab-button ${activeTab === "allocate" ? "active" : ""}`} onClick={() => setActiveTab("allocate")} style={{ background: "none", border: "none", color: activeTab === "allocate" ? "#FFF" : "#9EABB8", fontWeight: activeTab === "allocate" ? 600 : 400, cursor: "pointer", fontSize: 16 }}>
          Allocate Asset
        </button>
        <button className={`tab-button ${activeTab === "returns" ? "active" : ""}`} onClick={() => setActiveTab("returns")} style={{ background: "none", border: "none", color: activeTab === "returns" ? "#FFF" : "#9EABB8", fontWeight: activeTab === "returns" ? 600 : 400, cursor: "pointer", fontSize: 16 }}>
          Process Return
        </button>
        <button className={`tab-button ${activeTab === "transfers" ? "active" : ""}`} onClick={() => setActiveTab("transfers")} style={{ background: "none", border: "none", color: activeTab === "transfers" ? "#FFF" : "#9EABB8", fontWeight: activeTab === "transfers" ? 600 : 400, cursor: "pointer", fontSize: 16 }}>
          Transfer Requests
        </button>
      </div>

      {activeTab === "allocate" && <AllocateTab />}
      {activeTab === "returns" && <ReturnTab />}
      {activeTab === "transfers" && <TransfersTab />}
    </ScreenShell>
  );
}

function AllocateTab() {
  const [assetId, setAssetId] = useState("");
  const [holderType, setHolderType] = useState("user");
  const [holderId, setHolderId] = useState("");
  const [expectedReturnDate, setExpectedReturnDate] = useState("");

  const [assets, setAssets] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<any>(null);
  const [toast, setToast] = useState("");
  
  const [showTransferUI, setShowTransferUI] = useState(false);
  const [conflictData, setConflictData] = useState<any>(null);

  useEffect(() => {
    Promise.all([
      getAssetsList().then(d => setAssets(d.assets || [])).catch(() => {}),
      getEmployeesList().then(d => setEmployees(d.employees || [])).catch(() => {}),
      getDepartmentsList().then(d => setDepartments(d.departments || [])).catch(() => {})
    ]);
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!assetId || !holderType || !holderId || !expectedReturnDate) {
      setError({ message: "Select an asset, a holder, and an expected return date before allocating." });
      return;
    }

    setLoading(true);
    setError(null);
    setShowTransferUI(false);
    try {
      await createAllocation({
        asset_id: assetId,
        holder_type: holderType,
        holder_id: holderId,
        expected_return_date: expectedReturnDate || undefined
      });
      setToast("Asset allocated successfully.");
      setTimeout(() => setToast(""), 3000);
      setAssets((current) => current.filter((asset) => asset.id !== assetId));
      setAssetId("");
      setHolderId("");
      setExpectedReturnDate("");
    } catch (err: any) {
      if (err.code === "ASSET_ALREADY_ALLOCATED") {
        setError(err);
        setConflictData(err.details);
        setShowTransferUI(true);
      } else {
        setError({ message: err.message || "Failed to allocate asset." });
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleRequestTransfer() {
    if (!conflictData || !holderId) return;
    setLoading(true);
    setError(null);
    try {
      await createTransferRequest({
        asset_id: assetId,
        from_holder: conflictData.current_holder,
        to_holder: { holder_type: holderType, holder_id: holderId, expected_return_date: expectedReturnDate || undefined }
      });
      setToast("Transfer request submitted successfully.");
      setTimeout(() => setToast(""), 3000);
      setShowTransferUI(false);
      setAssetId("");
      setHolderId("");
    } catch (err: any) {
      setError({ message: err.message || "Failed to request transfer." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="panel" style={{ padding: 24, maxWidth: 600 }}>
      <h3 style={{ marginTop: 0 }}>Allocate Asset</h3>
      {error && !showTransferUI && <ErrorSummary message={error.message} />}
      
      {showTransferUI && (
        <div style={{ background: "#4A1C1C", border: "1px solid #E5484D", padding: 16, borderRadius: 6, marginBottom: 24 }}>
          <h4 style={{ margin: "0 0 8px 0", color: "#FFEAEA" }}>Allocation Conflict</h4>
          <p style={{ margin: "0 0 16px 0", color: "#FFC6C6" }}>{error.message}</p>
          <Button onClick={handleRequestTransfer} disabled={loading}>Request Transfer</Button>
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: "grid", gap: 16 }}>
        <FormField label="Asset *">
          <select required className="input" value={assetId} onChange={e => { setAssetId(e.target.value); setShowTransferUI(false); setError(null); }} disabled={loading}>
            <option value="">Select an asset...</option>
            {assets.map(a => <option key={a.id} value={a.id}>{a.name} ({a.asset_tag})</option>)}
          </select>
          <div style={{ fontSize: 12, color: "#9EABB8", marginTop: 4 }}>Note: You can type any Asset ID if it's not in the list.</div>
        </FormField>
        
        <FormField label="Asset ID (Manual override)">
           <Input value={assetId} onChange={e => { setAssetId(e.target.value); setShowTransferUI(false); setError(null); }} disabled={loading} placeholder="Paste raw asset UUID to force a conflict test" />
        </FormField>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 16 }}>
          <FormField label="Assign To *">
            <select required className="input" value={holderType} onChange={e => { setHolderType(e.target.value); setHolderId(""); }} disabled={loading}>
              <option value="user">Employee</option>
              <option value="department">Department</option>
            </select>
          </FormField>

          <FormField label="Select Holder *">
            <select required className="input" value={holderId} onChange={e => setHolderId(e.target.value)} disabled={loading}>
              <option value="">Select {holderType}...</option>
              {holderType === "user" && employees.map(e => <option key={e.id} value={e.id}>{e.name} ({e.email})</option>)}
              {holderType === "department" && departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </FormField>
        </div>

        <FormField label="Expected Return Date *">
          <Input required type="date" value={expectedReturnDate} onChange={e => setExpectedReturnDate(e.target.value)} disabled={loading} />
        </FormField>

        <div style={{ marginTop: 16 }}>
          <Button type="submit" disabled={loading || showTransferUI}>Allocate</Button>
        </div>
      </form>
      {toast && <Toast message={toast} />}
    </div>
  );
}

function ReturnTab() {
  const [assetId, setAssetId] = useState("");
  const [allocationId, setAllocationId] = useState("");
  const [notes, setNotes] = useState("");
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  async function checkAsset() {
    if (!assetId) return;
    setLoading(true);
    setError("");
    try {
      const data = await getAssetById(assetId);
      const activeAlloc = data.allocations?.find((a: any) => a.returned_at === null);
      if (!activeAlloc) {
        setError("This asset is not currently allocated.");
        setAllocationId("");
      } else {
        setAllocationId(activeAlloc.id);
        setError("");
      }
    } catch (err: any) {
      setError(err?.message || "Asset not found.");
    } finally {
      setLoading(false);
    }
  }

  async function handleReturn(e: FormEvent) {
    e.preventDefault();
    if (!allocationId) return;
    setLoading(true);
    try {
      await returnAllocation(allocationId, { return_condition_notes: notes });
      setToast("Asset returned successfully.");
      setTimeout(() => setToast(""), 3000);
      setError("");
      setAssetId("");
      setAllocationId("");
      setNotes("");
    } catch (err: any) {
      setError(err?.message || "Failed to process return.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="panel" style={{ padding: 24, maxWidth: 600 }}>
      <h3 style={{ marginTop: 0 }}>Process Return</h3>
      {error && <ErrorSummary message={error} />}

      <div style={{ display: "flex", gap: 12, alignItems: "flex-end", marginBottom: 24 }}>
        <div style={{ flex: 1 }}>
          <FormField label="Asset ID or Tag">
            <Input value={assetId} onChange={e => setAssetId(e.target.value)} placeholder="Enter asset UUID..." />
          </FormField>
        </div>
        <Button type="button" onClick={checkAsset} disabled={loading || !assetId}>Find Allocation</Button>
      </div>

      {allocationId && (
        <form onSubmit={handleReturn} style={{ display: "grid", gap: 16, borderTop: "1px solid #1E262F", paddingTop: 24 }}>
          <FormField label="Return Condition Notes">
            <textarea className="input" value={notes} onChange={(e: any) => setNotes(e.target.value)} placeholder="Note any damages or issues..." rows={3} />
          </FormField>
          <div>
            <Button type="submit" disabled={loading}>Process Return</Button>
          </div>
        </form>
      )}
      {toast && <Toast message={toast} />}
    </div>
  );
}

function TransfersTab() {
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  useEffect(() => {
    loadRequests();
  }, []);

  async function loadRequests() {
    setLoading(true);
    try {
      const data = await getTransferRequests();
      setRequests(data.transfer_requests || []);
    } catch (err: any) {
      setError(err?.message || "Failed to load transfer requests.");
    } finally {
      setLoading(false);
    }
  }

  async function handleAction(id: string, action: "approve" | "reject") {
    setLoading(true);
    try {
      if (action === "approve") {
        await approveTransferRequest(id);
        setToast("Transfer approved.");
      } else {
        const reason = prompt("Reason for rejection:");
        if (reason === null) {
          setLoading(false);
          return;
        }
        await rejectTransferRequest(id, reason || "No reason provided");
        setToast("Transfer rejected.");
      }
      setTimeout(() => setToast(""), 3000);
      loadRequests();
    } catch (err: any) {
      alert(err?.message || `Failed to ${action} transfer.`);
      setLoading(false);
    }
  }

  return (
    <div>
      {error && <ErrorSummary message={error} />}
      {loading && requests.length === 0 ? (
        <Skeleton lines={5} />
      ) : requests.length === 0 ? (
        <EmptyState title="No transfer requests pending." />
      ) : (
        <div className="panel">
          <table className="table">
            <thead>
              <tr>
                <th>Asset ID</th>
                <th>From</th>
                <th>To</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {requests.map(req => (
                <tr key={req.id}>
                  <td style={{ fontSize: 13 }}>{req.asset_id}</td>
                  <td>{req.from_holder?.holder_name || req.from_holder?.holder_id}</td>
                  <td>{req.to_holder?.holder_name || req.to_holder?.holder_id}</td>
                  <td>{req.status}</td>
                  <td>
                    {req.status === "pending" && (
                      <div style={{ display: "flex", gap: 8 }}>
                        <button className="button button--outline button--sm" onClick={() => handleAction(req.id, "approve")}>Approve</button>
                        <button className="button button--outline button--sm" style={{ color: "#E5484D", borderColor: "#E5484D" }} onClick={() => handleAction(req.id, "reject")}>Reject</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {toast && <Toast message={toast} />}
    </div>
  );
}
