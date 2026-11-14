export type OfficialDocument = {
  id: string;
  title: string;
  type: string | null;
  publishedAt: string | null;
  url: string;
};

export type PriceRegistrationMinute = {
  id: string;
  number: string;
  year: number | null;
  signedAt: string | null;
  startsAt: string | null;
  endsAt: string | null;
  cancelled: boolean;
  allowsAdhesion: boolean | null;
};

export type OfficialContract = {
  id: string;
  number: string;
  type: string | null;
  object: string | null;
  supplier: string | null;
  signedAt: string | null;
  startsAt: string | null;
  endsAt: string | null;
  value: number | null;
};

export type ProcurementHistoryEvent = {
  id: string;
  action: string;
  category: string;
  occurredAt: string | null;
  name: string | null;
  reason: string | null;
};

export type PncpProcurementDetails = {
  documents: OfficialDocument[];
  minutes: PriceRegistrationMinute[];
  contracts: OfficialContract[];
  history: ProcurementHistoryEvent[];
  warnings: Partial<Record<"documents" | "minutes" | "contracts" | "history", string>>;
  available: boolean;
};
