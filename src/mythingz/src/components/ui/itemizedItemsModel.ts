import type { ListItem } from '../../services/database';

export type ItemizedItem = Omit<ListItem, 'price' | 'quantity'> & {
  price: string;
  quantity: string;
};

export const createEmptyItemizedItem = (): ItemizedItem => ({
  text: '',
  done: false,
  price: '',
  quantity: '1',
});

export function parseItemizedItems(items: ItemizedItem[]): ListItem[] | null {
  const invalid = items.some((item) => {
    const price = item.price.trim() ? Number(item.price.replace(/,/g, '')) : 0;
    const quantity = item.quantity.trim() ? Number(item.quantity) : 1;
    return (item.price.trim() !== '' && (!Number.isFinite(price) || price < 0))
      || !Number.isInteger(quantity)
      || quantity < 1;
  });
  if (invalid) return null;

  return items
    .map((item) => ({
      text: item.text.trim(),
      done: item.done,
      price: item.price.trim() ? Number(item.price.replace(/,/g, '')) : 0,
      quantity: item.quantity.trim() ? Number(item.quantity) : 1,
    }))
    .filter((item) => item.text.length > 0);
}
