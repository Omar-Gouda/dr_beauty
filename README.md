This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## WhatsApp Click-to-Chat

Customer support links use WhatsApp Click-to-Chat and open a prefilled message that the user must send manually. Configure the public support destination as `NEXT_PUBLIC_WHATSAPP_SUPPORT_NUMBER` using an international phone number with digits only (no `+`, spaces, or punctuation). If it is unset or malformed, WhatsApp links display a non-blocking unavailable message. This is a public contact number, not a credential.

## WhatsApp Channel

Configure the public Channel invite URL with `NEXT_PUBLIC_WHATSAPP_CHANNEL_URL` in the local `.env.local` file for development and in the deployment provider's environment settings for production. Use only an HTTPS URL in the form `https://whatsapp.com/channel/<channel-id>`; the homepage link is omitted and an unavailable message is shown when the setting is missing or invalid. The rendered link is public, so this variable must never contain a secret. Next.js public variables are fixed at build time; set it in the deployment environment before building/redeploying the site. Do not commit the Channel URL in an environment file.

You can start editing the page by modifying `app/page.js`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
