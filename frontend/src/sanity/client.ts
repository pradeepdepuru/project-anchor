import { createClient } from "next-sanity";
export const client = createClient({
    projectId: "t3retdwe",
    dataset: "production",
    apiVersion: "2026-05-15",
    useCdn: false,
    stega: {
        enabled: process.env.NEXT_PUBLIC_VERCEL_ENV === 'preview' || process.env.NODE_ROOT !== 'production',
        studioUrl: 'http://localhost:3333', // Points to your Studio URL
    },
});