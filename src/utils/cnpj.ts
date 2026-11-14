export function normalizeCnpj(value: string) {
  return value.replace(/\D/g, "");
}

export function isValidCnpj(value: string) {
  const cnpj = normalizeCnpj(value);
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;
  const calculate = (length: number) => {
    let sum = 0;
    let weight = length - 7;
    for (let index = 0; index < length; index += 1) {
      sum += Number(cnpj[index]) * weight--;
      if (weight < 2) weight = 9;
    }
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };
  return calculate(12) === Number(cnpj[12]) && calculate(13) === Number(cnpj[13]);
}

export function formatCnpj(value: string) {
  const cnpj = normalizeCnpj(value).slice(0, 14);
  return cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
}
