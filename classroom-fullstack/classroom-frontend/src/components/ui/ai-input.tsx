import React from "react";
import { Button } from "./button";

const AIInput = ({onGenerate, isLoading}: {
  onGenerate: () => void,
  isLoading: boolean
}) => {
  return (
    <Button onClick={onGenerate} disabled={isLoading}>
      {isLoading ? "Generating..." : "Auto compile with AI"}
    </Button>
  );
};

export default AIInput;
