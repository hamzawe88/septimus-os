package handlers

import (
	"errors"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/septimus-os/backend-core/database"
	"github.com/septimus-os/backend-core/services"
	"gorm.io/gorm"
)

type dynamicRecordWriteRequest struct {
	Data                  map[string]interface{} `json:"data"`
	ExpectedRecordVersion int                    `json:"expected_record_version,omitempty"`
}

func CreateDynamicRecord(c *fiber.Ctx) error {
	var request dynamicRecordWriteRequest
	if err := c.BodyParser(&request); err != nil || request.Data == nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid record body"})
	}
	record, err := services.CreateDynamicRecordAs(
		database.GetDB(c), CurrentWorkspaceID(c), dynamicRecordPrincipal(c),
		strings.TrimSpace(c.Params("definitionKey")), request.Data,
	)
	if err != nil {
		return dynamicRecordError(c, err)
	}
	return c.Status(fiber.StatusCreated).JSON(record)
}

func GetDynamicRecord(c *fiber.Ctx) error {
	recordID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid record id"})
	}
	record, err := services.GetDynamicRecordAs(
		database.GetDB(c), CurrentWorkspaceID(c), dynamicRecordPrincipal(c),
		c.Params("definitionKey"), recordID,
	)
	if err != nil {
		return dynamicRecordError(c, err)
	}
	return c.JSON(record)
}

func QueryDynamicRecords(c *fiber.Ctx) error {
	var request services.RecordQueryRequest
	if len(c.Body()) > 0 {
		if err := c.BodyParser(&request); err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid query AST"})
		}
	}
	result, err := services.QueryDynamicRecordsAs(
		database.GetDB(c), CurrentWorkspaceID(c), dynamicRecordPrincipal(c),
		c.Params("definitionKey"), request,
	)
	if err != nil {
		return dynamicRecordError(c, err)
	}
	return c.JSON(result)
}

// QueryAIDynamicRecords is reserved for the internal AI sidecar. Unlike the
// ordinary internal record endpoint, it removes PII, confidential, hidden,
// relation, file, and user fields before any value can enter a model prompt.
func QueryAIDynamicRecords(c *fiber.Ctx) error {
	var request services.RecordQueryRequest
	if len(c.Body()) > 0 {
		if err := c.BodyParser(&request); err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid query AST"})
		}
	}
	principal := services.RecordPrincipal{
		Role:   strings.ToLower(strings.TrimSpace(c.Get("X-User-Role"))),
		Source: "ai",
	}
	result, err := services.QueryDynamicRecordsForAIAs(
		database.GetDB(c), CurrentWorkspaceID(c), principal,
		strings.TrimSpace(c.Params("definitionKey")), request,
	)
	if err != nil {
		return dynamicRecordError(c, err)
	}
	return c.JSON(result)
}

func UpdateDynamicRecord(c *fiber.Ctx) error {
	recordID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid record id"})
	}
	var request dynamicRecordWriteRequest
	if err := c.BodyParser(&request); err != nil || request.Data == nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid record body"})
	}
	record, err := services.UpdateDynamicRecordAs(
		database.GetDB(c), CurrentWorkspaceID(c), dynamicRecordPrincipal(c), c.Params("definitionKey"),
		recordID, request.ExpectedRecordVersion, request.Data,
	)
	if err != nil {
		return dynamicRecordError(c, err)
	}
	return c.JSON(record)
}

func DeleteDynamicRecord(c *fiber.Ctx) error {
	recordID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid record id"})
	}
	if err := services.DeleteDynamicRecordAs(
		database.GetDB(c), CurrentWorkspaceID(c), dynamicRecordPrincipal(c), c.Params("definitionKey"), recordID,
	); err != nil {
		return dynamicRecordError(c, err)
	}
	return c.SendStatus(fiber.StatusNoContent)
}

func actorUUID(c *fiber.Ctx) uuid.UUID {
	if actor := currentUserUUID(c); actor != nil {
		return *actor
	}
	return uuid.Nil
}

func dynamicRecordPrincipal(c *fiber.Ctx) services.RecordPrincipal {
	role, _ := c.Locals("role").(string)
	principal := services.PrincipalForUser(actorUUID(c), role)
	principal.IPAddress = c.IP()
	if id, _ := c.Locals("api_key_id").(string); id != "" {
		principal.UserID = uuid.Nil
		principal.Role = ""
		principal.Source = "api_key"
	} else if strings.HasPrefix(c.Path(), "/internal/") {
		principal.UserID = uuid.Nil
		principal.Role = ""
		principal.Source = "internal"
	}
	return principal
}

func dynamicRecordError(c *fiber.Ctx, err error) error {
	var validation *services.SchemaValidationError
	var operation *services.RecordOperationError
	switch {
	case errors.Is(err, gorm.ErrRecordNotFound):
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "record or schema not found", "code": "NOT_FOUND"})
	case errors.Is(err, services.ErrRecordVersionConflict):
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": "record was changed by another editor", "code": "RECORD_VERSION_CONFLICT"})
	case errors.As(err, &validation):
		return c.Status(fiber.StatusUnprocessableEntity).JSON(fiber.Map{"error": "record validation failed", "code": "RECORD_VALIDATION_FAILED", "details": validation.Issues})
	case errors.As(err, &operation):
		if operation.Code == "FIELD_WRITE_FORBIDDEN" || operation.Code == "SYSTEM_RECORD_COMMAND_REQUIRED" {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
				"error": operation.Message,
				"code":  operation.Code,
			})
		}
		return c.Status(fiber.StatusUnprocessableEntity).JSON(fiber.Map{"error": operation.Message, "code": "INVALID_RECORD_OPERATION"})
	default:
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "record operation failed", "code": "RECORD_OPERATION_FAILED"})
	}
}
