import { useState, useEffect, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  Button,
  EmptyState,
  ScreenShell,
  StatusChip,
  Input,
  Skeleton,
  ErrorSummary,
  FormField,
  Modal,
  Toast,
} from "../../design-system";
import type { Status } from "../../design-system";
import { useAuth } from "../../auth/AuthContext";
import {
  getAssets,
  createAsset,
  getCategories,
  getDepartments,
  type Asset,
  type AssetStatus,
} from "./api";
import type { AssetCategory, Department } from "../org-setup/api";

export function AssetRegistryScreen() {
  const { user } = useAuth();
  
  const [assets, setAssets] = useState<Asset[]>([]);
  const [categories, setCategories] = useState<AssetCategory[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterDept, setFilterDept] = useState("");
  const [filterLocation, setFilterLocation] = useState("");

  const [showRegister, setShowRegister] = useState(false);

  useEffect(() => {
    Promise.all([
      getCategories().catch(() => []),
      getDepartments().catch(() => [])
    ]).then(([cats, depts]) => {
      setCategories(cats);
      setDepartments(depts);
    });
  }, []);

  useEffect(() => {
    loadAssets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterCategory, filterStatus, filterDept, filterLocation]);

  async function loadAssets() {
    setLoading(true);
    setError("");
    try {
      const { assets: data } = await getAssets({
        search,
        category: filterCategory || undefined,
        status: filterStatus || undefined,
        department: filterDept || undefined,
        location: filterLocation || undefined,
      });
      setAssets(data);
    } catch (err: any) {
      setError(err?.message || "Unable to load assets.");
    } finally {
      setLoading(false);
    }
  }

  function handleSearchKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      loadAssets();
    }
  }

  const canRegister = user?.role === "admin" || user?.role === "asset_manager";

  return (
    <ScreenShell title="Asset registry" description="Search, filter, and manage organizational assets.">
      {error && <ErrorSummary message={error} />}

      <div className="search-bar" style={{ flexWrap: "wrap", marginBottom: 24 }}>
        <Input
          placeholder="Search name, tag, serial (press Enter)"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={handleSearchKeyDown}
          style={{ width: 280 }}
        />
        
        <select className="input" style={{ width: 160 }} value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
          <option value="">All categories</option>
          {categories.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>

        <select className="input" style={{ width: 160 }} value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="available">Available</option>
          <option value="allocated">Allocated</option>
          <option value="reserved">Reserved</option>
          <option value="under_maintenance">Under Maintenance</option>
          <option value="lost">Lost</option>
          <option value="retired">Retired</option>
          <option value="disposed">Disposed</option>
        </select>

        <select className="input" style={{ width: 160 }} value={filterDept} onChange={(e) => setFilterDept(e.target.value)}>
          <option value="">All departments</option>
          {departments.map(d => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>

        <Input
          placeholder="Location"
          value={filterLocation}
          onChange={(e) => setFilterLocation(e.target.value)}
          onKeyDown={handleSearchKeyDown}
          style={{ width: 140 }}
        />

        <Button onClick={loadAssets}>Filter</Button>

        {canRegister && (
          <Button onClick={() => setShowRegister(true)} style={{ marginLeft: "auto" }}>
            Register asset
          </Button>
        )}
      </div>

      {loading ? (
        <Skeleton lines={6} />
      ) : assets.length === 0 ? (
        <EmptyState
          title={search || filterCategory || filterStatus ? "No assets matching filters." : "No assets yet. Register your first one."}
          action={
            canRegister ? (
              <Button onClick={() => setShowRegister(true)}>Register asset</Button>
            ) : <span />
          }
        />
      ) : (
        <div className="panel">
          <table className="table">
            <thead>
              <tr>
                <th>Asset Tag</th>
                <th>Name & Serial</th>
                <th>Category</th>
                <th>Location</th>
                <th>Status</th>
                <th style={{ width: 100 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {assets.map((asset) => (
                <tr key={asset.id}>
                  <td style={{ fontWeight: 600 }}>{asset.asset_tag}</td>
                  <td>
                    <div>{asset.name}</div>
                    <div style={{ fontSize: 12, color: "#9EABB8" }}>SN: {asset.serial_number}</div>
                  </td>
                  <td style={{ color: "#9EABB8" }}>
                    {categories.find((c) => c.id === asset.category_id)?.name || "Unknown"}
                  </td>
                  <td style={{ color: "#9EABB8" }}>{asset.location}</td>
                  <td>
                    <StatusChip status={formatAssetStatus(asset.status)} />
                  </td>
                  <td>
                    <Link to={`/assets/${asset.id}`} className="button button--outline button--sm">
                      Passport
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showRegister && (
        <RegisterAssetModal
          categories={categories}
          onClose={() => setShowRegister(false)}
          onSaved={() => {
            setShowRegister(false);
            loadAssets();
            setToast("Asset registered successfully!");
            setTimeout(() => setToast(""), 3000);
          }}
        />
      )}

      {toast && <Toast message={toast} />}
    </ScreenShell>
  );
}

const assetStatusLabels: Record<AssetStatus, Status> = {
  available: "Available",
  allocated: "Allocated",
  reserved: "Reserved",
  under_maintenance: "Under Maintenance",
  lost: "Lost",
  retired: "Retired",
  disposed: "Disposed",
};

function formatAssetStatus(status: AssetStatus): Status {
  return assetStatusLabels[status];
}

function RegisterAssetModal({
  categories,
  onClose,
  onSaved,
}: {
  categories: AssetCategory[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [acquisitionDate, setAcquisitionDate] = useState("");
  const [acquisitionCost, setAcquisitionCost] = useState("");
  const [condition, setCondition] = useState("new");
  const [location, setLocation] = useState("");
  const [isBookable, setIsBookable] = useState(false);
  const [photoUrl, setPhotoUrl] = useState("");

  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    if (!name || !categoryId || !serialNumber || !acquisitionDate || !condition || !location) {
      setError("Please fill all required fields.");
      return;
    }

    setPending(true);
    try {
      await createAsset({
        name: name.trim(),
        category_id: categoryId,
        serial_number: serialNumber.trim(),
        acquisition_date: acquisitionDate,
        acquisition_cost: Number(acquisitionCost) || 0,
        condition,
        location: location.trim(),
        is_bookable: isBookable,
        photo_url: photoUrl.trim() || undefined,
      });
      onSaved();
    } catch (err: any) {
      setError(err?.message || "Failed to register asset.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,.6)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100,
    }}>
      <form onSubmit={handleSubmit} style={{ width: 600, maxHeight: "90vh", overflowY: "auto", background: "#141A21", padding: 24, borderRadius: 8 }}>
        <h2 style={{ margin: "0 0 16px 0", fontSize: 20 }}>Register new asset</h2>
        {error && <ErrorSummary message={error} />}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <FormField label="Asset Name *">
            <Input required value={name} onChange={(e) => setName(e.target.value)} disabled={pending} placeholder="e.g. MacBook Pro M3" />
          </FormField>

          <FormField label="Category *">
            <select required className="input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} disabled={pending}>
              <option value="">Select category...</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </FormField>

          <FormField label="Serial Number *">
            <Input required value={serialNumber} onChange={(e) => setSerialNumber(e.target.value)} disabled={pending} />
          </FormField>

          <FormField label="Location *">
            <Input required value={location} onChange={(e) => setLocation(e.target.value)} disabled={pending} placeholder="e.g. BLR-HQ-F1" />
          </FormField>

          <FormField label="Acquisition Date *">
            <Input required type="date" value={acquisitionDate} onChange={(e) => setAcquisitionDate(e.target.value)} disabled={pending} />
          </FormField>

          <FormField label="Acquisition Cost">
            <Input type="number" step="0.01" value={acquisitionCost} onChange={(e) => setAcquisitionCost(e.target.value)} disabled={pending} placeholder="0.00" />
          </FormField>

          <FormField label="Condition *">
            <select required className="input" value={condition} onChange={(e) => setCondition(e.target.value)} disabled={pending}>
              <option value="new">New</option>
              <option value="good">Good</option>
              <option value="fair">Fair</option>
              <option value="poor">Poor</option>
            </select>
          </FormField>
          
          <FormField label="Photo URL">
            <Input value={photoUrl} onChange={(e) => setPhotoUrl(e.target.value)} disabled={pending} placeholder="https://..." />
          </FormField>
        </div>

        <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 8 }}>
          <input
            type="checkbox"
            id="bookable"
            checked={isBookable}
            onChange={(e) => setIsBookable(e.target.checked)}
            disabled={pending}
          />
          <label htmlFor="bookable" style={{ color: "#E1E7EC" }}>Available for general booking</label>
        </div>

        <div style={{ display: "flex", gap: 12, marginTop: 32 }}>
          <Button type="submit" disabled={pending}>
            {pending ? "Registering…" : "Register asset"}
          </Button>
          <button type="button" className="button button--outline" onClick={onClose} disabled={pending}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

import { useParams } from "react-router-dom";
import { getAssetById, updateAsset } from "./api";

export function AssetPassportScreen() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<any>(null);
  const [categories, setCategories] = useState<AssetCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  
  const [editingStatus, setEditingStatus] = useState(false);
  const [newStatus, setNewStatus] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (id) {
      loadData(id);
    }
  }, [id]);

  async function loadData(assetId: string) {
    setLoading(true);
    setError("");
    try {
      const [passport, cats] = await Promise.all([
        getAssetById(assetId),
        getCategories().catch(() => [])
      ]);
      setData(passport);
      setCategories(cats);
    } catch (err: any) {
      setError(err?.message || "Failed to load asset passport.");
    } finally {
      setLoading(false);
    }
  }

  async function handleStatusUpdate(e: FormEvent) {
    e.preventDefault();
    if (!id || !newStatus) return;
    setSaving(true);
    try {
      await updateAsset(id, { status: newStatus });
      setEditingStatus(false);
      loadData(id);
      setToast("Status updated successfully.");
      setTimeout(() => setToast(""), 3000);
    } catch (err: any) {
      alert(err?.message || "Failed to update status.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <ScreenShell title="Asset passport" description=""><Skeleton lines={8} /></ScreenShell>;
  if (error || !data?.asset) return <ScreenShell title="Asset passport" description=""><ErrorSummary message={error || "Asset not found"} /></ScreenShell>;

  const { asset, allocations, transfer_requests, bookings, maintenance_requests, audit_findings, activity } = data;
  const categoryName = categories.find(c => c.id === asset.category_id)?.name || "Unknown";

  // Build chronological timeline
  const timeline: { date: string; type: string; title: string; desc: string }[] = [];
  
  allocations?.forEach((a: any) => timeline.push({ date: a.allocated_at, type: "allocation", title: "Allocated", desc: `To ${a.holder_type}` }));
  transfer_requests?.forEach((t: any) => timeline.push({ date: t.created_at, type: "transfer", title: "Transfer Request", desc: `Status: ${t.status}` }));
  bookings?.forEach((b: any) => timeline.push({ date: b.created_at, type: "booking", title: "Booking Created", desc: `From ${b.start_date} to ${b.end_date}` }));
  maintenance_requests?.forEach((m: any) => timeline.push({ date: m.created_at, type: "maintenance", title: "Maintenance", desc: m.issue_description }));
  audit_findings?.forEach((af: any) => timeline.push({ date: af.created_at, type: "audit", title: "Audit Finding", desc: `Status: ${af.status}` }));
  activity?.forEach((act: any) => timeline.push({ date: act.created_at, type: "activity", title: "Activity", desc: act.action }));

  // Push creation event
  timeline.push({ date: asset.created_at || asset.acquisition_date || new Date().toISOString(), type: "creation", title: "Asset Registered", desc: `Acquired on ${asset.acquisition_date}` });

  // Sort newest first
  timeline.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <ScreenShell title={`Passport: ${asset.name}`} description={`Asset Tag: ${asset.asset_tag} | Serial: ${asset.serial_number}`}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 24, alignItems: "start" }}>
        
        {/* Main Timeline Column */}
        <div className="panel" style={{ padding: 24 }}>
          <h2 style={{ marginTop: 0, fontSize: 18, borderBottom: "1px solid #1E262F", paddingBottom: 16 }}>Lifecycle Timeline</h2>
          {timeline.length === 0 ? (
            <p style={{ color: "#9EABB8" }}>No activity recorded yet.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 24, marginTop: 16 }}>
              {timeline.map((item, i) => (
                <div key={i} style={{ display: "flex", gap: 16 }}>
                  <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#4E6172", marginTop: 4, flexShrink: 0 }} />
                  <div>
                    <div style={{ fontWeight: 600 }}>{item.title}</div>
                    <div style={{ fontSize: 13, color: "#9EABB8", marginBottom: 4 }}>
                      {new Date(item.date).toLocaleString()}
                    </div>
                    <div style={{ fontSize: 14 }}>{item.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Sidebar Info Column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="panel" style={{ padding: 20 }}>
            <h3 style={{ marginTop: 0, fontSize: 16, marginBottom: 16 }}>Current Status</h3>
            
            {editingStatus ? (
              <form onSubmit={handleStatusUpdate}>
                <select className="input" value={newStatus} onChange={e => setNewStatus(e.target.value)} disabled={saving} style={{ width: "100%", marginBottom: 8 }}>
                  <option value="">Select status...</option>
                  <option value="available">Available</option>
                  <option value="allocated">Allocated</option>
                  <option value="reserved">Reserved</option>
                  <option value="under_maintenance">Under Maintenance</option>
                  <option value="lost">Lost</option>
                  <option value="retired">Retired</option>
                  <option value="disposed">Disposed</option>
                </select>
                <div style={{ display: "flex", gap: 8 }}>
                  <Button type="submit" disabled={saving}>Save</Button>
                  <button type="button" className="button button--outline" onClick={() => setEditingStatus(false)}>Cancel</button>
                </div>
              </form>
            ) : (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <StatusChip status={asset.status.replace("_", " ") as any} />
                <button className="button button--outline button--sm" onClick={() => { setEditingStatus(true); setNewStatus(asset.status); }}>Update</button>
              </div>
            )}
          </div>

          <div className="panel" style={{ padding: 20 }}>
            <h3 style={{ marginTop: 0, fontSize: 16, marginBottom: 16 }}>Details</h3>
            <div style={{ display: "grid", gap: 12, fontSize: 14 }}>
              <div>
                <div style={{ color: "#9EABB8", fontSize: 12 }}>Category</div>
                <div>{categoryName}</div>
              </div>
              <div>
                <div style={{ color: "#9EABB8", fontSize: 12 }}>Location</div>
                <div>{asset.location}</div>
              </div>
              <div>
                <div style={{ color: "#9EABB8", fontSize: 12 }}>Condition</div>
                <div style={{ textTransform: "capitalize" }}>{asset.condition}</div>
              </div>
              <div>
                <div style={{ color: "#9EABB8", fontSize: 12 }}>Acquisition Cost</div>
                <div>${asset.acquisition_cost}</div>
              </div>
              {asset.last_verified_at && (
                <div>
                  <div style={{ color: "#9EABB8", fontSize: 12 }}>Last Verified</div>
                  <div>{new Date(asset.last_verified_at).toLocaleDateString()}</div>
                </div>
              )}
            </div>
          </div>
        </div>

      </div>
      {toast && <Toast message={toast} />}
    </ScreenShell>
  );
}
