"use client";

import React from "react";
import WorkflowBuilder from "@/components/workflows/WorkflowBuilder";

export default function WorkflowsPage() {
  return (
    <div className="w-full h-full bg-background flex flex-col">
      <WorkflowBuilder />
    </div>
  );
}
