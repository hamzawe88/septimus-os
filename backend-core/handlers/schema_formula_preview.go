package handlers

import (
	"errors"
	"sort"

	"github.com/gofiber/fiber/v2"
	"github.com/septimus-os/backend-core/services"
)

type schemaFormulaPreviewRequest struct {
	Expression string                 `json:"expression"`
	Values     map[string]interface{} `json:"values"`
}

func PreviewSchemaFormula(c *fiber.Ctx) error {
	definition, err := findSchemaDefinition(c)
	if err != nil {
		return err
	}
	var req schemaFormulaPreviewRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}
	expression, err := services.ParseFormula(req.Expression)
	if err != nil {
		return schemaValidationResponse(c, &services.SchemaValidationError{
			Issues: []string{"formula: " + err.Error()},
		})
	}
	fields := parseSchemaFields(definition.DraftUISchema)
	fieldTypes := make(map[string]string, len(fields))
	for _, field := range fields {
		fieldTypes[field.Key] = field.Type
	}
	dependencies := expression.Dependencies()
	sort.Strings(dependencies)
	for _, dependency := range dependencies {
		fieldType, exists := fieldTypes[dependency]
		if !exists {
			return schemaValidationResponse(c, &services.SchemaValidationError{
				Issues: []string{"formula references an unknown field"},
			})
		}
		if fieldType != "number" && fieldType != "integer" && fieldType != "formula" {
			return schemaValidationResponse(c, &services.SchemaValidationError{
				Issues: []string{"formula references a non-numeric field"},
			})
		}
	}
	result, err := expression.Evaluate(req.Values)
	if err != nil {
		var validationErr *services.SchemaValidationError
		if errors.As(err, &validationErr) {
			return schemaValidationResponse(c, validationErr)
		}
		return schemaValidationResponse(c, &services.SchemaValidationError{
			Issues: []string{"formula preview could not be evaluated"},
		})
	}
	return c.JSON(fiber.Map{
		"result": result, "dependencies": dependencies,
	})
}
