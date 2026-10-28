"use client";

import { Dashboard, Reports } from "@/components/gestao/essencial";
import { ManageOrders } from "@/components/gestao/pedidos";
import { useRestaurant } from "@/lib/restaurant-store";
import { PageTitle, NotFound } from "@/components/shared/blocos";
import { FinanceWorkspace, CashShiftPanel } from "@/components/finance-workspace";
import { FiscalWorkspace } from "@/components/fiscal-workspace";
import { ManagementSettings } from "@/components/management-settings";
import { ManagementTables } from "@/components/management-tables";
import { ManagementMenu } from "@/components/management-menu";
import { CostManagement } from "@/components/cost-management";
import { TeamManagement } from "@/components/team-management";
import { InventoryManagement } from "@/components/inventory-management";

export function ManagementSection({ section }: { section: string }) {
  const {plan}=useRestaurant();
  if(plan==='essential' && ['custos','fiscal','configuracoes-fiscal'].includes(section))return (
    <section className="settings-card" aria-labelledby="professional-plan-title">
      <h3 id="professional-plan-title">Recurso do plano Profissional</h3>
      <p className="mt-3 text-sm">
        {section === 'custos'
          ? 'Acompanhe os custos dos ingredientes e das receitas para entender quanto custa cada prato.'
          : section === 'fiscal'
            ? 'Acompanhe os documentos fiscais do restaurante e suas pendências.'
            : 'Configure os dados fiscais do restaurante para preparar a emissão de notas.'}
      </p>
      <p className="mt-3 text-sm">Para conhecer o plano Profissional e liberar este recurso, fale com o suporte.</p>
    </section>
  );
  if(plan==='essential' && section==='dashboard')return <Dashboard />;
  if(plan==='essential' && section==='relatorios')return <Reports />;
  if(plan==='essential' && ['caixa','financeiro'].includes(section))return <CashShiftPanel />;
  if (section === "configuracoes-fiscal") return <ManagementSettings key="fiscal" initialSection="fiscal" />; if (section === "fiscal") return <FiscalWorkspace />; if (section === "dashboard") return <FinanceWorkspace key="dashboard" />; if(section === "financeiro") return <FinanceWorkspace />; if (section === "mesas") return <ManagementTables />; if (section === "pedidos") return <ManageOrders />; if (section === "cardapio") return <ManagementMenu />; if (section === "estoque") return <Stock />; if(section === "custos")return <CostManagement />; if (section === "caixa") return <FinanceWorkspace key="cash" initialTab="cash" />; if (section === "equipe") return <><PageTitle title="Equipe" subtitle="Cadastre cada pessoa com nome, papel e PIN para iniciar o turno." /><TeamManagement /></>; if (section === "relatorios") return <FinanceWorkspace key="results" initialTab="results" />; if (section === "configuracoes") return <ManagementSettings />; return <NotFound />;
}

function Stock() { return <InventoryManagement />; }
