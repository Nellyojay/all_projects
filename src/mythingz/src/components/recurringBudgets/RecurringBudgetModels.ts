import type {
  BudgetTemplate,
  BudgetTemplateItem,
  BudgetRecurrence,
} from '../../services/database';
import { localDateKey } from '../../services/database';

export type TemplateWithItems = BudgetTemplate & { items: BudgetTemplateItem[] };
export type TemplateDraft = {
  id?: number;
  name: string;
  description: string;
  recurrence: BudgetRecurrence;
  startDate: string;
  endDate: string;
  weekStartDay: number;
  active: boolean;
  archived: boolean;
  items: BudgetTemplateItem[];
};

export function blankItem(): BudgetTemplateItem {
  return {
    name: '',
    description: '',
    allocated_amount: 0,
    category: '',
    rollover: 'reset',
    alert_thresholds: [50, 75, 90, 100],
    active: true,
  };
}

export function blankTemplate(): TemplateDraft {
  return {
    name: '',
    description: '',
    recurrence: 'daily',
    startDate: localDateKey(),
    endDate: '',
    weekStartDay: new Date().getDay(),
    active: true,
    archived: false,
    items: [blankItem()],
  };
}
