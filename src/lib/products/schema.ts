import { z } from 'zod';

const optionalDigits = (length: number, label: string) => z.string().trim().refine(
  (value) => value === '' || new RegExp(`^\\d{${length}}$`).test(value),
  `${label} deve conter ${length} dígitos.`
);

export function isValidGtin(value: string) {
  if (!/^(\d{8}|\d{12}|\d{13}|\d{14})$/.test(value)) return false;
  const digits = value.split('').map(Number);
  const checkDigit = digits.pop()!;
  const sum = digits.reverse().reduce((total, digit, index) => total + digit * (index % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === checkDigit;
}

export const productFormSchema = z.object({
  sku: z.string().trim().max(80, 'O SKU pode ter no máximo 80 caracteres.'),
  name: z.string().trim().min(1, 'Informe o nome do produto.').max(180),
  brand: z.string().trim().max(120),
  category: z.string().trim().max(120),
  location: z.string().trim().max(120),
  price: z.number().min(0, 'O preço não pode ser negativo.'),
  stockQuantity: z.number().min(0, 'O estoque não pode ser negativo.'),
  minStock: z.number().min(0, 'O estoque mínimo não pode ser negativo.'),
  ncm: optionalDigits(8, 'O NCM'),
  cest: optionalDigits(7, 'O CEST'),
  fiscalOrigin: z.union([z.literal(''), z.enum(['0', '1', '2', '3', '4', '5', '6', '7', '8'])]),
  fiscalUnit: z.string().trim().min(1, 'Informe a unidade comercial.').max(6).transform((value) => value.toUpperCase()),
  gtin: z.string().trim(),
  withoutGtin: z.boolean(),
  showInStore: z.boolean()
}).superRefine((data, context) => {
  if (!data.withoutGtin && data.gtin && !isValidGtin(data.gtin)) {
    context.addIssue({ code: 'custom', path: ['gtin'], message: 'O GTIN informado possui formato ou dígito verificador inválido.' });
  }
  if (data.withoutGtin && data.gtin) {
    context.addIssue({ code: 'custom', path: ['gtin'], message: 'Remova o GTIN ou desmarque “Produto sem GTIN”.' });
  }
});

export type ProductFormValues = z.infer<typeof productFormSchema>;

