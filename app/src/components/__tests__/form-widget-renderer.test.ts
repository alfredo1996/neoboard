import { describe, it, expect } from "vitest";
import { deriveFormFields } from "@/lib/derive-form-fields";

describe("deriveFormFields", () => {
  it("extracts $param_xxx tokens into FormFieldDef[]", () => {
    const query = "CREATE (n:Person {name: $param_name, email: $param_email})";
    const fields = deriveFormFields(query);

    expect(fields).toHaveLength(2);
    expect(fields[0]).toEqual({ name: "param_name", label: "name", type: "text" });
    expect(fields[1]).toEqual({ name: "param_email", label: "email", type: "text" });
  });

  it("deduplicates repeated tokens", () => {
    const query = "MATCH (n) WHERE n.name = $param_name SET n.alias = $param_name";
    const fields = deriveFormFields(query);

    expect(fields).toHaveLength(1);
    expect(fields[0].name).toBe("param_name");
  });

  it("applies fieldConfig overrides for label and type", () => {
    const query = "CREATE (n {name: $param_name, age: $param_age})";
    const fieldConfig = {
      param_name: { label: "Full Name" },
      param_age: { label: "Age", type: "number" as const },
    };
    const fields = deriveFormFields(query, fieldConfig);

    expect(fields).toHaveLength(2);
    expect(fields[0]).toEqual({ name: "param_name", label: "Full Name", type: "text" });
    expect(fields[1]).toEqual({ name: "param_age", label: "Age", type: "number" });
  });

  it("defaults all fields to type text", () => {
    const query = "INSERT INTO users (name, dob) VALUES ($param_name, $param_dob)";
    const fields = deriveFormFields(query);

    for (const field of fields) {
      expect(field.type).toBe("text");
    }
  });

  it("returns empty array for query with no params", () => {
    const query = "MATCH (n) RETURN n LIMIT 10";
    const fields = deriveFormFields(query);

    expect(fields).toEqual([]);
  });

  it("returns empty array for empty query", () => {
    expect(deriveFormFields("")).toEqual([]);
  });

  it("derives label from param name by stripping param_ prefix", () => {
    const query = "CREATE (n {first_name: $param_first_name})";
    const fields = deriveFormFields(query);

    expect(fields[0].label).toBe("first_name");
  });

  it("handles mixed case param names", () => {
    const query = "CREATE (n {name: $param_userName, id: $param_ID})";
    const fields = deriveFormFields(query);

    expect(fields).toHaveLength(2);
    expect(fields[0].name).toBe("param_userName");
    expect(fields[1].name).toBe("param_ID");
  });
});
