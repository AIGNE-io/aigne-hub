import Footer from '@blocklet/ui-react/lib/Footer';
import Header from '@blocklet/ui-react/lib/Header';
import { Error, Send } from '@mui/icons-material';
import { Alert, Box, CircularProgress, IconButton, Input, InputAdornment } from '@mui/material';
import produce from 'immer';
import { nanoid } from 'nanoid';
import { useState } from 'react';

import { AIResponse, ai } from '../../libs/ai';

const nextId = () => nanoid(16);

export default function Playground() {
  const [conversations, setConversations] = useState<
    { id: string; prompt: string; response?: AIResponse; error?: Error }[]
  >([]);

  return (
    <>
      <Box sx={{ position: 'sticky', top: 0 }}>
        <Header maxWidth={null} />
      </Box>

      <Box flexGrow={1} m={2}>
        <Box maxWidth={800} mx="auto" overflow="auto">
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
      </Box>

      <Box sx={{ position: 'sticky', bottom: 0 }}>
        <Box height={16} sx={{ pointerEvents: 'none', background: 'linear-gradient(transparent, white)' }} />
        <Box mx={2} pb={2} sx={{ bgcolor: 'background.paper' }}>
          <Box maxWidth={800} mx="auto">
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

        <Box sx={{ bgcolor: 'background.paper' }}>
          <Footer />
        </Box>
      </Box>
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
    <Box
      component="form"
      sx={{ boxShadow: 2, margin: 'auto', px: 1, borderRadius: 1 }}
      onSubmit={(e) => e.preventDefault()}>
      <Input
        fullWidth
        disableUnderline
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        endAdornment={
          <InputAdornment position="end">
            <IconButton onClick={submit} size="small" type="submit">
              <Send fontSize="small" />
            </IconButton>
          </InputAdornment>
        }
      />
    </Box>
  );
}
