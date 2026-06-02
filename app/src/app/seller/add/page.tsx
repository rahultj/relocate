import { BulkAdd } from "./bulk-add-client";

export const metadata = {
  title: "Add items · Saudade",
};

export default function SellerAddPage() {
  return (
    <main className="min-h-screen bg-bg-main">
      <BulkAdd />
    </main>
  );
}
