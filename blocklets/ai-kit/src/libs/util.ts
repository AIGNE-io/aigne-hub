export const formatError = (err: any) => {
  if (!err) {
    return 'Unknown error';
  }

  const { details, errors, response } = err;

  // graphql error
  if (Array.isArray(errors)) {
    return errors.map((x) => x.message).join('\n');
  }

  // joi validate error
  if (Array.isArray(details)) {
    const formatted = details.map((e) => {
      const errorMessage = e.message.replace(/["]/g, "'");
      const errorPath = e.path.join('.');
      return `${errorPath}: ${errorMessage}`;
    });

    return `Validate failed: ${formatted.join(';')}`;
  }

  // axios error
  if (response) {
    return response.data?.error || `${err.message}: ${JSON.stringify(response.data)}`;
  }

  return err.message;
};
