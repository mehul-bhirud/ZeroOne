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

export function AssetPassportScreen() {
  return (
    <ScreenShell title="Asset passport" description="Custody, bookings, maintenance, audits, and activity appear chronologically.">
      <EmptyState title="Select an asset from the registry to view its passport." />
    </ScreenShell>
  );
}
