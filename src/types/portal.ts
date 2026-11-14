export type PortalSnapshot = {
  share: { id: string; clientName: string; expiresAt: string };
  procurement: null | {
    controlNumber: string;
    objectDescription: string;
    statusName: string | null;
    publishedAt: string | null;
  };
  messages: Array<{
    id: string;
    senderType: "tenant_user" | "client";
    senderName: string;
    body: string;
    createdAt: string;
  }>;
  events: Array<{
    id: string;
    title: string;
    description: string | null;
    eventType: string;
    createdAt: string;
  }>;
  documentRequests: Array<{
    id: string;
    title: string;
    description: string | null;
    status: "requested" | "uploaded" | "accepted" | "rejected";
    dueAt: string | null;
    maxSizeBytes: number;
    allowedMimeTypes: string[];
  }>;
};
