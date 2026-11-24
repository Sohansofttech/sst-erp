import { POST as sendOtp } from "../send/route";

export async function POST(request: Request) {
  return sendOtp(request);
}
