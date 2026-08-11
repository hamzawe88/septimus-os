package services

import (
	"strings"
	"testing"
)

func TestCompileRecordFilterUsesAllowlistedFieldAsArgument(t *testing.T) {
	sql, args, err := CompileRecordFilter(RecordFilter{
		Field: "title", Op: "contains", Value: `%_report`,
	}, []SchemaFieldInput{{Key: "title", Type: "text"}})
	if err != nil {
		t.Fatalf("compile filter: %v", err)
	}
	if strings.Contains(sql, "title") || len(args) != 2 || args[0] != "title" {
		t.Fatalf("field was interpolated instead of bound: sql=%q args=%#v", sql, args)
	}
	if args[1] != `%\%\_report%` {
		t.Fatalf("LIKE wildcards were not escaped: %#v", args[1])
	}
}

func TestCompileRecordFilterRejectsInjectionAndDeepTrees(t *testing.T) {
	_, _, err := CompileRecordFilter(RecordFilter{
		Field: `title') OR TRUE --`, Op: "eq", Value: "x",
	}, []SchemaFieldInput{{Key: "title", Type: "text"}})
	if err == nil {
		t.Fatal("unknown injected field accepted")
	}
	_, _, err = CompileRecordFilter(RecordFilter{
		Field: "title", Op: "raw_sql", Value: "TRUE",
	}, []SchemaFieldInput{{Key: "title", Type: "text"}})
	if err == nil {
		t.Fatal("unknown operator accepted")
	}
}
