import { BillingIntegrationError } from "./razorpay";

type Order = { id: string; keyId: string };

// Retrying the local conditional write is safe; creating a second provider order is not.
export async function createAndPersistOrder(input: {
  invoiceNumber: string;
  create: () => Promise<Order>;
  persist: (orderId: string) => Promise<number>;
  lookup: () => Promise<string | null | undefined>;
  onOrderReceived: (orderId: string) => void;
}): Promise<Order> {
  let order: Order;
  try {
    order = await input.create();
  } catch (error) {
    if (error instanceof BillingIntegrationError &&
      ["RAZORPAY_NOT_CONFIGURED", "RAZORPAY_TEST_MODE_REQUIRED"].includes(error.code)) {
      throw error;
    }
    throw new BillingIntegrationError(
      `The order outcome is unknown. Do not retry checkout; contact support with invoice ${input.invoiceNumber}.`,
      503,
      "ORDER_OUTCOME_UNKNOWN",
    );
  }

  input.onOrderReceived(order.id);
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      if (await input.persist(order.id) === 1) return order;
    } catch {
      // The write may have committed even if its acknowledgement was lost.
    }
    try {
      const current = await input.lookup();
      if (current === order.id) return order;
      if (current !== null && current !== undefined) break;
    } catch {
      // Retry the same conditional write; never create another provider order here.
    }
  }
  throw new BillingIntegrationError(
    `The order could not be confirmed locally. Do not retry checkout; contact support with invoice ${input.invoiceNumber}.`,
    503,
    "ORDER_PERSISTENCE_UNCONFIRMED",
  );
}
