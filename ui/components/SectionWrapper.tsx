import type { ReactNode } from 'react';

type Section = {
  id: string;
  title?: string;
  width: '1/3' | '2/3' | 'full';
};

type SectionWrapperProps = {
  section: Section;
  children: ReactNode;
};

const widthClassMap: Record<Section['width'], string> = {
  '1/3': 'col-span-4',
  '2/3': 'col-span-8',
  full: 'col-span-12',
};

export default function SectionWrapper({ section, children }: SectionWrapperProps) {
  return (
    <div
      className={`${widthClassMap[section.width]} rounded-3xl border border-zinc-800 bg-zinc-900/80`}
    >
      <div className="border-b border-zinc-800 px-4 py-3 text-sm font-medium text-zinc-300">
        {section.title ?? section.id}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}
