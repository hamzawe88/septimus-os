import os
file1 = "src/components/crm/CrmDashboard.tsx"
with open(file1, 'r') as f:
    content = f.read()

# Fix revenue calculation to include won leads as well (or just use leads if there are no deals)
import re
new_content = content.replace('''      // Fetch CRM Deals (for revenue)
      const dealsRes = await apiGet(`/entities?workspace_id=${workspaceId}&type=deal`) as any;
      let totalRevenue = 0;
      let wonDeals = 0;
      if (dealsRes.data) {
        dealsRes.data.forEach((deal: any) => {
          const amount = parseFloat(deal.data?.amount || 0);
          if (deal.data?.status === "Won") {
            totalRevenue += amount;
            wonDeals++;
          }
        });
      }''', '''      // Calculate revenue from Won Leads
      let totalRevenue = 0;
      let wonDeals = 0;
      if (leadsRes.data) {
        leadsRes.data.forEach((lead: any) => {
          if (lead.data?.status === "won" || lead.data?.status === "Won") {
            const amount = parseFloat(lead.data?.value || lead.data?.amount || 0);
            totalRevenue += amount;
            wonDeals++;
          }
        });
      }''')

with open(file1, 'w') as f:
    f.write(new_content)
print("Updated CrmDashboard.tsx")
