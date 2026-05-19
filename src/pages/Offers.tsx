import CrudPage, { Field } from "@/components/CrudPage";

const fields: Field[] = [
  { name: "name", label: "Name" },
  { name: "offer_type", label: "Type", type: "select", default: "percentage", options: [
    { value: "percentage", label: "Percentage % off" },
    { value: "fixed", label: "Fixed ₹ off" },
    { value: "time_based", label: "Free minutes (after threshold)" },
  ]},
  { name: "value", label: "Value (% or ₹ — ignored for free-minutes)", type: "number", default: 0 },
  { name: "min_minutes", label: "Minimum minutes (for free-minutes offer)", type: "number", default: 0 },
  { name: "free_minutes", label: "Free minutes to award", type: "number", default: 0 },
];

const Offers = () => (
  <CrudPage title="Offers" description="Discounts and time-based promotions" table="offers" fields={fields}
    columns={[
      { key: "name", label: "Name" },
      { key: "offer_type", label: "Type" },
      { key: "value", label: "Value", render: (r) => r.offer_type === "time_based" ? `${r.free_minutes || 0}m free if ≥${r.min_minutes || 0}m` : r.value },
      { key: "active", label: "Active", render: (r) => r.active ? "Yes" : "No" },
    ]} />
);
export default Offers;
