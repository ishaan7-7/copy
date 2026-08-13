import type React from "react";
import { Box, Stack, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";

type DashboardHeaderTitleProps = {
  title: string;
  icon: React.ReactNode;
  subtitle?: string;
  size?: "page" | "section";
};

export default function DashboardHeaderTitle({
  title,
  icon,
  subtitle,
  size = "page",
}: DashboardHeaderTitleProps) {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  const isPage = size === "page";
  const accent = isDark ? "#ffffff" : "#005071";

  return (
    <Stack direction="row" alignItems="center" spacing={1} minWidth={0}>
      <Box
        sx={{
          width: isPage ? 24 : 22,
          height: isPage ? 24 : 22,
          borderRadius: "8px",
          display: "grid",
          placeItems: "center",
          color: accent,
          bgcolor: alpha(accent, isDark ? 0.1 : 0.1),
          border: `1px solid ${alpha(accent, isDark ? 0.22 : 0.18)}`,
          flex: "0 0 auto",
          "& .MuiSvgIcon-root": {
            fontSize: isPage ? 14 : 12,
          },
        }}
      >
        {icon}
      </Box>
      <Box minWidth={0}>
        <Typography
          variant={isPage ? "h5" : "subtitle2"}
          sx={{
            fontWeight: 900,
            color: isDark ? "text.primary" : "#005071",
            letterSpacing: 0,
            fontSize: `${isPage ? 14 : 12}px !important`,
            lineHeight: 1.1,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {title}
        </Typography>
        {subtitle && (
          <Typography
            sx={{
              mt: 0.2,
              fontSize: "10px",
              color: "text.secondary",
              lineHeight: 1.15,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {subtitle}
          </Typography>
        )}
      </Box>
    </Stack>
  );
}
