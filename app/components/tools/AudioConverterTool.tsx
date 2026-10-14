"use client";

import React from "react";
import CaptureConvertRack from "@/app/components/tools/CaptureConvertRack";
import { ToolRackProps } from "@/app/components/tools/tool-rack-types";

export default function AudioConverterTool(props: ToolRackProps) {
  return <CaptureConvertRack {...props} />;
}
