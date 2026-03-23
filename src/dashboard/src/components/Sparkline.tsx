import { LineChart, Line, ResponsiveContainer } from "recharts";

interface Props {
  data: number[];
  color: string;
  height?: number;
}

export function Sparkline({ data, color, height = 40 }: Props) {
  const chartData = data.map((v, i) => ({ i, v }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={chartData}>
        <Line type="monotone" dataKey="v" stroke={color} dot={false} strokeWidth={1.5} />
      </LineChart>
    </ResponsiveContainer>
  );
}
