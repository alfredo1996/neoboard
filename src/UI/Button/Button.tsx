import React from "react";
import Button from "@mui/material/Button";

const Button = ({
                       children,
                       variant = "contained",
                       color = "primary",
                       size = "medium",
                       startIcon,
                       endIcon,
                       disabled = false,
                       fullWidth = false,
                       onClick,
                       type = "button",
                       sx = {},
                   }) => {
    return (
        <Button
            variant={variant}
            color={color}
            size={size}
            startIcon={startIcon}
            endIcon={endIcon}
            disabled={disabled}
            fullWidth={fullWidth}
            onClick={onClick}
            type={type}
            sx={sx}
        >
            {children}
        </Button>
    );
};

export default MuiButton;
