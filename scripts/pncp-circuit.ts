// Informa se o serviço de itens do PNCP está com o disjuntor aberto. Saída: "open <segundos>" (código 10) ou "closed" (código 0).
import { circuitOpenSeconds } from "../src/lib/pncp-throttle";

circuitOpenSeconds("pncp-items").then((seconds) => {
  if (seconds > 0) { process.stdout.write(`open ${seconds}`); process.exit(10); }
  process.stdout.write("closed"); process.exit(0);
}).catch(() => { process.stdout.write("closed"); process.exit(0); });
