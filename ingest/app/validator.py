import re
from typing import Dict, Any
from pydantic import BaseModel, ValidationError, create_model
from pydantic.config import ConfigDict

from replay.service.schema_loader import MasterSchema

# Contract format: "YYYY-MM-DD HH:MM:SS+ZZ:ZZ". The contract only declares
# "timestamp" as dtype "object" (i.e. Python str) with no format constraint,
# so a pydantic str-typed field accepts ANY string — a malformed value like
# "2024-08-04 08:00:00.000" (naive, millisecond fraction) passes type
# validation cleanly and rides all the way to Gold before anything notices.
# This explicit format check is what actually routes that class of defect to
# the DLQ at the door instead of silently corrupting the live pipeline.
_TIMESTAMP_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}([+-]\d{2}:?\d{2})?$")


class IngestValidationError(Exception):

    def __init__(
        self,
        *,
        module: str,
        message: str,
        details: Dict[str, Any],
    ):
        self.module = module
        self.message = message
        self.details = details
        super().__init__(message)


class DefensiveValidator:

    def __init__(self, schema: MasterSchema):
        self.schema = schema
        self._models: Dict[str, BaseModel] = {}

        self._build_models()

    
    def _build_models(self) -> None:
        for module_name, module_spec in self.schema.modules.items():
            fields = {}

            for col_name, col_spec in module_spec["columns"].items():
                dtype = col_spec["dtype"]
                nullable = col_spec["nullable"]

                py_type = self._map_dtype(dtype)
                default = None if nullable else ...

                fields[col_name] = (py_type, default)

            model = create_model(
                f"{module_name.capitalize()}IngestRow",
                __config__=ConfigDict(extra="forbid"),
                **fields,
            )

            self._models[module_name] = model

    
    def validate(
        self,
        *,
        module: str,
        data: Dict[str, Any],
    ) -> Dict[str, Any]:
        

        if module not in self._models:
            raise IngestValidationError(
                module=module,
                message="Unknown module",
                details={"module": module},
            )

        module_spec = self.schema.modules[module]
        expected_columns = list(module_spec["columns"].keys())

        
        if self.schema.validation_rules["enforce_column_order"]:
            actual_columns = list(data.keys())
            if actual_columns != expected_columns:
                raise IngestValidationError(
                    module=module,
                    message="Column order mismatch",
                    details={
                        "expected": expected_columns,
                        "actual": actual_columns,
                    },
                )

        
        Model = self._models[module]

        try:
            validated = Model(**data)
        except ValidationError as e:
            raise IngestValidationError(
                module=module,
                message="Schema validation failed",
                details=e.errors(),
            )

        dumped = validated.model_dump()

        timestamp_value = dumped.get("timestamp")
        if timestamp_value is not None and not _TIMESTAMP_PATTERN.match(str(timestamp_value)):
            raise IngestValidationError(
                module=module,
                message="Timestamp format violation",
                details={"column": "timestamp", "value": timestamp_value},
            )

        return dumped

    
    @staticmethod
    def _map_dtype(dtype: str):
        if dtype == "float64":
            return float
        if dtype == "int64":
            return int
        if dtype == "object":
            return str

        raise ValueError(f"Unsupported dtype: {dtype}")
