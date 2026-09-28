export type LifecycleMethod = "Update" | "LateUpdate" | "FixedUpdate";

export type RuleName =
  | "gc-string-concatenation-in-frame-loop"
  | "gc-linq-in-frame-loop"
  | "gc-allocation-in-frame-loop"
  | "component-lookup-in-frame-loop"
  | "scene-search-in-frame-loop"
  | "public-field-serialization";

export interface GuardrailViolation {
  fileName: string;
  filePath: string;
  line: number;
  ruleName: RuleName;
  severity: "warning";
  message: string;
  recommendation: string;
  lifecycleMethod?: LifecycleMethod;
}

export interface GuardrailReport {
  fileName: string;
  filePath: string;
  violations: GuardrailViolation[];
  summary: {
    total: number;
    byRule: Partial<Record<RuleName, number>>;
  };
}

export interface LifecycleBlock {
  method: LifecycleMethod;
  bodyStart: number;
  bodyEnd: number;
}
