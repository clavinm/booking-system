import { easebuzzNotification } from "@/lib/easebuzz-http";

export function POST(request: Request) {
  return easebuzzNotification(request, "return");
}
