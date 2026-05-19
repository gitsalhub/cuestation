import CrudPage, { Field } from "@/components/CrudPage";

const fields: Field[] = [
  { name: "name", label: "Name" },
  { name: "category", label: "Category", default: "snacks" },
  { name: "price", label: "Price", type: "number", default: 0 },
  { name: "stock", label: "Stock", type: "number", default: 0 },
];

const Products = () => (
  <CrudPage title="Products" description="Inventory used in counter sales" table="products" fields={fields}
    columns={[
      { key: "name", label: "Name" },
      { key: "category", label: "Category" },
      { key: "price", label: "Price", render: (r) => `₹${Number(r.price).toFixed(2)}` },
      { key: "stock", label: "Stock", render: (r) => {
          const s = Number(r.stock || 0);
          const threshold = Number(r.stock_threshold ?? 5);
          if (s === 0) return <span className="text-destructive font-semibold">OUT OF STOCK</span>;
          if (s < threshold) return <span className="text-orange-500 font-semibold">LOW STOCK ({s})</span>;
          return <span>{s}</span>;
        } },
    ]} />
);
export default Products;
