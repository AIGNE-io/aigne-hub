import { Alert } from '@mui/material';
import { Component, ReactNode } from 'react';

export interface ErrorBoundaryProps {
  children: ReactNode;
}

export interface ErrorBoundaryState {
  error?: Error;
}

export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {};
  }

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  // eslint-disable-next-line react/no-unused-class-component-methods
  reset = () => this.setState({ error: undefined });

  override render() {
    const { error } = this.state;

    if (error) {
      return (
        <Alert color="error" sx={{ m: 2 }}>
          {error.message}
        </Alert>
      );
    }

    return this.props.children;
  }
}
