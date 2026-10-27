// Start a sale — /sell. The first screen of the photo-first seller flow:
// name, pickup, available from. No account; the next screen is the seller's
// private link.

import { StartSaleForm } from "./start-sale-form";

export const metadata = {
  title: "Start a sale · mustgo",
};

export default function SellPage() {
  return (
    <main className="min-h-screen bg-bg-main">
      <StartSaleForm />
    </main>
  );
}
