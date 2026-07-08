import type { ReactNode } from "react";

interface Props {
  title: string;
  description: ReactNode;
}

export function PageHeader({ title, description }: Props) {
  return (
    <header className="mb-8">
      <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
      <p className="mt-1 text-base text-gray-500 dark:text-gray-400">{description}</p>
    </header>
  );
}
