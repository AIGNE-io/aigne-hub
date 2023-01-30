import Footer from '@blocklet/ui-react/lib/Footer';
import Header from '@blocklet/ui-react/lib/Header';
import styled from '@emotion/styled';
import { Error, Send } from '@mui/icons-material';
import { Alert, Avatar, Box, BoxProps, CircularProgress, IconButton, Input, InputAdornment } from '@mui/material';
import { AxiosError } from 'axios';
import produce from 'immer';
import { nanoid } from 'nanoid';
import { ReactNode, useState } from 'react';

import { AIResponse, completions } from '../../libs/ai';

const nextId = () => nanoid(16);

export default function Playground() {
  const [conversations, setConversations] = useState<
    { id: string; prompt: string; response?: AIResponse; error?: Error }[]
  >([]);

  return (
    <>
      <Box sx={{ position: 'sticky', zIndex: 100, top: 0 }}>
        <Header maxWidth={null} />
      </Box>

      <Box flexGrow={1} m={2}>
        <Box maxWidth={800} mx="auto" overflow="auto">
          {conversations.map((item) => (
            <Box key={item.id} id={`conversation-${item.id}`}>
              <ConversationItem avatar={<Avatar sx={{ bgcolor: 'secondary.main' }} />}>{item.prompt}</ConversationItem>
              <ConversationItem
                my={1}
                id={`response-${item.id}`}
                avatar={<Avatar sx={{ bgcolor: 'primary.main' }}>AI</Avatar>}>
                {item.response ? (
                  <Box whiteSpace="pre-wrap">{item.response?.choices.at(0)?.text}</Box>
                ) : item.error ? (
                  <Alert color="error" icon={<Error />}>
                    {(item.error as AxiosError<{ message: string }>).response?.data?.message || item.error.message}
                  </Alert>
                ) : (
                  <CircularProgress size={16} />
                )}
              </ConversationItem>
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
                setTimeout(() => {
                  document.getElementById(`conversation-${id}`)?.scrollIntoView({ behavior: 'smooth' });
                });
                try {
                  const response = await completions({ prompt });
                  setConversations((v) =>
                    produce(v, (draft) => {
                      const item = draft.find((i) => i.id === id);
                      if (item) {
                        item.response = {
                          ...response,
                          choices: response.choices.map((i) => ({ ...i, text: i.text.trim() })),
                        };
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
                } finally {
                  setTimeout(() => {
                    document.getElementById(`response-${id}`)?.scrollIntoView({ behavior: 'smooth' });
                  });
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

function ConversationItem({ children, avatar, ...props }: { children: ReactNode; avatar: ReactNode } & BoxProps) {
  return (
    <Box {...props} display="flex">
      <AvatarWrapper mr={1}>{avatar}</AvatarWrapper>
      <Box minHeight={30} display="flex" alignItems="center" flex={1} overflow="hidden">
        {children}
      </Box>
    </Box>
  );
}

const AvatarWrapper = styled(Box)`
  > .MuiAvatar-root {
    width: 30px;
    height: 30px;
  }
`;

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
