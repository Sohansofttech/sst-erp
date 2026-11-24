import { NextRequest, NextResponse } from "next/server";
import { resolveAdminContext, handleAdminApiError } from "@/lib/security/admin-auth";
import { PaymentGatewayService } from "@/lib/services/payment-gateway.service";
import { PaymentGatewayProvider, GatewayEnvironment } from "@/types/payment-gateway";

/**
 * GET /api/admin/settings/payment-gateways
 * Returns masked payment gateway configurations and payment preferences for the caller's institution.
 */
export async function GET(req: NextRequest) {
  try {
    const { institutionId } = await resolveAdminContext(req);

    const gateways = await PaymentGatewayService.getInstitutionGateways(institutionId);
    const preferences = await PaymentGatewayService.getPaymentPreferences(institutionId);

    return NextResponse.json({
      success: true,
      data: {
        gateways,
        preferences,
      },
    });
  } catch (err) {
    return handleAdminApiError(err);
  }
}

/**
 * POST /api/admin/settings/payment-gateways
 * Manages gateway configurations, connection testing, default gateway assignment, and disconnect.
 */
export async function POST(req: NextRequest) {
  try {
    const { institutionId, userId } = await resolveAdminContext(req);
    const body = await req.json();
    const { action } = body;

    switch (action) {
      case "SAVE_CONFIG": {
        const { provider, environment, keyId, keySecret, webhookSecret, isEnabled, isDefault } = body;
        if (!provider || (provider !== "RAZORPAY" && provider !== "CASHFREE")) {
          return NextResponse.json(
            { success: false, error: "Invalid provider specified. Must be RAZORPAY or CASHFREE." },
            { status: 400 }
          );
        }

        const updated = await PaymentGatewayService.saveGatewayConfig(
          institutionId,
          {
            provider,
            environment: environment as GatewayEnvironment,
            keyId,
            keySecret,
            webhookSecret,
            isEnabled,
            isDefault,
          },
          userId
        );

        return NextResponse.json({
          success: true,
          message: `${provider === "RAZORPAY" ? "Razorpay" : "Cashfree"} configuration updated successfully.`,
          data: updated,
        });
      }

      case "TEST_CONNECTION": {
        const { provider, keyId, keySecret, environment } = body;
        if (!provider || (provider !== "RAZORPAY" && provider !== "CASHFREE")) {
          return NextResponse.json(
            { success: false, error: "Invalid provider specified." },
            { status: 400 }
          );
        }

        const result = await PaymentGatewayService.testGatewayConnection(
          institutionId,
          provider as PaymentGatewayProvider,
          keyId && keySecret ? { keyId, keySecret, environment } : undefined,
          userId
        );

        return NextResponse.json({
          success: result.success,
          message: result.message,
          lastVerifiedAt: result.lastVerifiedAt,
        });
      }

      case "DISCONNECT": {
        const { provider } = body;
        if (!provider || (provider !== "RAZORPAY" && provider !== "CASHFREE")) {
          return NextResponse.json(
            { success: false, error: "Invalid provider specified." },
            { status: 400 }
          );
        }

        const result = await PaymentGatewayService.disconnectGateway(
          institutionId,
          provider as PaymentGatewayProvider,
          userId
        );

        return NextResponse.json(result);
      }

      case "UPDATE_PREFERENCES": {
        const { onlinePaymentsEnabled, defaultGateway } = body;
        const updated = await PaymentGatewayService.savePaymentPreferences(institutionId, {
          onlinePaymentsEnabled:
            onlinePaymentsEnabled !== undefined ? Boolean(onlinePaymentsEnabled) : undefined,
          defaultGateway: defaultGateway || null,
        });

        return NextResponse.json({
          success: true,
          message: "Payment preferences updated.",
          data: updated,
        });
      }

      case "SET_DEFAULT": {
        const { provider } = body;
        if (!provider || (provider !== "RAZORPAY" && provider !== "CASHFREE")) {
          return NextResponse.json(
            { success: false, error: "Invalid provider specified." },
            { status: 400 }
          );
        }

        await PaymentGatewayService.saveGatewayConfig(
          institutionId,
          {
            provider: provider as PaymentGatewayProvider,
            environment: "TEST",
            isDefault: true,
          },
          userId
        );

        return NextResponse.json({
          success: true,
          message: `${provider === "RAZORPAY" ? "Razorpay" : "Cashfree"} set as default payment gateway.`,
        });
      }

      default:
        return NextResponse.json(
          { success: false, error: `Unsupported action '${action}'` },
          { status: 400 }
        );
    }
  } catch (err) {
    return handleAdminApiError(err);
  }
}
