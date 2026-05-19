import { ReactNode } from "react";

interface Props {
  title: string;
  description?: string;
  actions?: ReactNode;
}

const PageHeader = ({ title, description, actions }: Props) => (
  <div className="flex items-start justify-between mb-8 gap-4">
    <div>
      <h1 className="text-3xl font-bold tracking-tight neon-text">{title}</h1>
      {description && <p className="text-muted-foreground mt-1">{description}</p>}
    </div>
    {actions && <div className="flex gap-2">{actions}</div>}
  </div>
);

export default PageHeader;
