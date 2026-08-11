import React, { useState } from "react";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Sector
} from "recharts";
import { useLocalization } from "@/contexts/LocalizationContext";

interface DonutDatum {
  name?: string;
  label?: string;
  value: number;
}

interface ExpensesDonutChartProps {
  data: DonutDatum[];
}

const COLORS = ['var(--destructive)', 'var(--warning)', 'var(--info)', 'var(--success)', 'var(--primary)'];

interface ActiveShapeProps {
  cx: number;
  cy: number;
  innerRadius: number;
  outerRadius: number;
  startAngle: number;
  endAngle: number;
  fill: string;
  payload: DonutDatum;
  percent: number;
}

const renderActiveShape = (props: unknown) => {
  const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill, payload, percent } = props as ActiveShapeProps;

  return (
    <g>
      <text x={cx} y={cy - 10} dy={8} textAnchor="middle" fill={fill} className="text-sm font-bold">
        {payload.label || payload.name}
      </text>
      <text x={cx} y={cy + 15} dy={8} textAnchor="middle" fill="var(--muted-foreground)" className="text-xs">
        {`${(percent * 100).toFixed(1)}%`}
      </text>
      <Sector
        cx={cx}
        cy={cy}
        innerRadius={innerRadius}
        outerRadius={outerRadius + 8}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
      />
      <Sector
        cx={cx}
        cy={cy}
        startAngle={startAngle}
        endAngle={endAngle}
        innerRadius={outerRadius + 10}
        outerRadius={outerRadius + 12}
        fill={fill}
      />
    </g>
  );
};

export default function ExpensesDonutChart({ data }: ExpensesDonutChartProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const { t } = useLocalization();

  const onPieEnter = (_: unknown, index: number) => {
    setActiveIndex(index);
  };

  return (
    <div className="bg-card dark:bg-card rounded-xl shadow-sm border border-border dark:border-border p-6 h-full flex flex-col transition-colors duration-300">
      <h3 className="font-bold text-foreground dark:text-muted-foreground mb-2">{t("finance.expensesDistribution")}</h3>
      <p className="text-sm text-muted-foreground mb-4">{t("finance.expensesByDept")}</p>

      <div className="flex-1 min-h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              {...({ activeIndex } as unknown as Partial<React.ComponentProps<typeof Pie>>)}
              activeShape={renderActiveShape}
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={80}
              outerRadius={110}
              paddingAngle={5}
              dataKey="value"
              onMouseEnter={onPieEnter}
              animationDuration={1500}
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                backgroundColor: 'rgba(26, 26, 26, 0.9)',
                border: 'none',
                borderRadius: '8px',
                color: 'var(--color-paper)',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
              }}
              itemStyle={{ color: 'var(--color-paper)' }}
              formatter={(value) => `$${value}`}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
