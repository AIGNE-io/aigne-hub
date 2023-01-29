import Footer from '@blocklet/ui-react/lib/Footer';
import Header from '@blocklet/ui-react/lib/Header';
import { Error, Send } from '@mui/icons-material';
import { Alert, Box, CircularProgress, IconButton, Input, InputAdornment } from '@mui/material';
import produce from 'immer';
import { useState } from 'react';

import { AIResponse, ai } from '../../libs/ai';

let currentId = 0;
const nextId = () => ++currentId;

export default function Playground() {
  const [conversations, setConversations] = useState<
    { id: number; prompt: string; response?: AIResponse; error?: Error }[]
  >([]);

  return (
    <>
      <Header maxWidth={null} />

      <Box flexGrow={1} sx={{ display: 'flex', flexDirection: 'column', mx: 2 }}>
        <Box
          sx={{
            flex: 1,
            maxWidth: 800,
            width: '100%',
            margin: 'auto',
            display: 'flex',
            flexDirection: 'column',
          }}>
          <Box flex={1} overflow="auto">
            {conversations.map((item) => (
              <Box key={item.id}>
                <Box my={1}>{item.prompt}</Box>
                <Box my={1}>
                  {item.response ? (
                    <Box whiteSpace="pre-wrap">{item.response?.choices.at(0)?.text}</Box>
                  ) : item.error ? (
                    <Alert color="error" icon={<Error />}>
                      {item.error.message}
                    </Alert>
                  ) : (
                    <CircularProgress size={20} />
                  )}
                </Box>
              </Box>
            ))}
          </Box>
          <Box my={2}>
            <Prompt
              onSubmit={async (prompt) => {
                const id = nextId();
                setConversations((v) => v.concat({ id, prompt }));
                try {
                  const response = await ai({ prompt });
                  setConversations((v) =>
                    produce(v, (draft) => {
                      const item = draft.find((i) => i.id === id);
                      if (item) {
                        item.response = response;
                      }
                    })
                  );
                } catch (error) {
                  setConversations((v) =>
                    produce(v, (draft) => {
                      const item = draft.find((i) => i.id === id);
                      if (item) {
                        item.error = error;
                      }
                    })
                  );

                  throw error;
                }
              }}
            />
          </Box>
        </Box>
      </Box>

      <Footer />
    </>
  );
}

function Prompt({ onSubmit }: { onSubmit: (prompt: string) => any }) {
  const [prompt, setPrompt] = useState('');
  const submit = () => {
    onSubmit(prompt);
    setPrompt('');
  };

  return (
    <Box sx={{ boxShadow: 2, margin: 'auto', px: 1, borderRadius: 1 }}>
      <Input
        fullWidth
        disableUnderline
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        endAdornment={
          <InputAdornment position="end">
            <IconButton onClick={submit} size="small">
              <Send fontSize="small" />
            </IconButton>
          </InputAdornment>
        }
      />
    </Box>
  );
}
