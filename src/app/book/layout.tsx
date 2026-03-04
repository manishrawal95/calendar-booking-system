import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Book a Chat',
  description: 'Schedule a 15-minute intro call — Job Seeker (after 7 PM) or Peer Networking (1–3 PM).',
};

export default function BookLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
