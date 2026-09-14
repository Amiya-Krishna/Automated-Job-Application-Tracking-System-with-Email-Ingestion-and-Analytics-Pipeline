import { api } from '@/services/api';
import type { Company, CompaniesListParams, CompaniesMeta, CompanyDetail } from '@/types/companies';

export interface CompaniesPage {
  companies: Company[];
  meta: CompaniesMeta;
}

export async function getCompanies(params: CompaniesListParams = {}): Promise<CompaniesPage> {
  const { data } = await api.get<{ data: Company[]; meta: CompaniesMeta }>('/companies', { params });
  return { companies: data.data, meta: data.meta };
}

export async function getCompanyDetail(id: number): Promise<CompanyDetail> {
  const { data } = await api.get<{ data: CompanyDetail }>(`/companies/${id}`);
  return data.data;
}
