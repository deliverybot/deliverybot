import { Controller } from "./base";
import ApexCharts from "apexcharts";

export class MetricsController extends Controller {
  static targets = ["loader", "total", "day", "lead"];

  async connect() {
    const resp = await fetch(window.location.href, {
      headers: { accept: "application/json" },
    });
    const data = await resp.json();
    const metrics = data.metrics;
    this.update(metrics);
  }

  async update(data: any) {
    const loader = this.targets.find("loader");
    const total = this.targets.find("total");
    const day = this.targets.find("day");
    const lead = this.targets.find("lead");
    const chart = this.targets.find("chart");

    if (loader) loader.remove();
    if (total) total.innerHTML = `${data.totalDeploys}`;
    if (day) day.innerHTML = `${data.avgDeploysPerDayWords}`;
    if (lead) lead.innerHTML = `${data.avgLeadTimeWords}`;

    if (!chart) {
      return;
    }
    new ApexCharts(chart, {
      chart: {
        height: 250,
        type: "line",
        toolbar: { show: false },
        zoom: { enabled: false },
      },
      colors: ["#0366d6", "#28a745", "#6f42c1", "#ea4aaa", "#d73a49"],
      dataLabels: { enabled: false },
      stroke: { width: 1.5 },
      xaxis: { categories: data.allDaysWords },
      series: data.environments.map((env: string) => {
        return {
          name: env,
          data: data.allDays.map((day: string) => {
            return data.deploysByDayAndEnv[`${day}.${env}`] || 0;
          }),
        };
      }),
    }).render();
  }
}
