'use client';

import React from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';

interface BackButtonProps {
  href?: string;
  onClick?: (e: React.MouseEvent) => void;
}

const className =
  'inline-flex items-center gap-2 px-4 py-2 rounded-full border border-foreground/10 text-foreground/60 text-sm font-medium hover:border-foreground/20 hover:bg-foreground/5 transition-all duration-200';

export const BackButton: React.FC<BackButtonProps> = ({ href = '/#contact', onClick }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    className="mb-8"
  >
    {onClick ? (
      <button type="button" onClick={onClick} className={className}>
        <ArrowLeft className="w-4 h-4" />
        Back to portfolio
      </button>
    ) : (
      <Link href={href} className={className}>
        <ArrowLeft className="w-4 h-4" />
        Back to portfolio
      </Link>
    )}
  </motion.div>
);
