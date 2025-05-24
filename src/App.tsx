import { useState, useRef, useEffect } from 'react';
import { 
  Container, 
  Box, 
  TextField, 
  Button, 
  Slider, 
  Typography, 
  Paper,
  IconButton,
  Stack,
  ThemeProvider,
  createTheme,
  Tooltip,
  Fade,
  Select,
  MenuItem,
  FormControl,
  InputLabel
} from '@mui/material';
import { PlayArrow, Pause, Stop, Upload, Speed, VolumeUp } from '@mui/icons-material';
import * as pdfjsLib from 'pdfjs-dist';
import mammoth from 'mammoth';

// Initialize PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

// Create theme
const theme = createTheme({
  palette: {
    primary: {
      main: '#2563eb',
      light: '#60a5fa',
      dark: '#1d4ed8',
    },
    background: {
      default: '#f8fafc',
      paper: '#ffffff',
    },
  },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
    h2: {
      fontWeight: 800,
      letterSpacing: '-0.03em',
    },
    h3: {
      fontWeight: 600,
    },
    subtitle1: {
      fontWeight: 500,
      letterSpacing: '0.02em',
    },
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          borderRadius: '12px',
          padding: '10px 24px',
          fontWeight: 600,
        },
        contained: {
          boxShadow: '0 4px 12px rgba(37, 99, 235, 0.2)',
          '&:hover': {
            boxShadow: '0 6px 16px rgba(37, 99, 235, 0.3)',
          },
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          borderRadius: '16px',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.05)',
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: '12px',
          },
        },
      },
    },
  },
});

function App() {
  const [text, setText] = useState<string>('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [url, setUrl] = useState('');
  const [currentWordIndex, setCurrentWordIndex] = useState(-1);
  const [words, setWords] = useState<string[]>([]);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState<string>('');
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const speechRef = useRef<SpeechSynthesis | null>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const currentIndexRef = useRef(-1);
  const isPausedRef = useRef(false);

  // Load available voices
  useEffect(() => {
    const loadVoices = () => {
      const availableVoices = window.speechSynthesis.getVoices();
      setVoices(availableVoices);
      
      // Set default voice to first English voice or first available voice
      if (availableVoices.length > 0) {
        const englishVoice = availableVoices.find(voice => 
          voice.lang.startsWith('en-')
        ) || availableVoices[0];
        setSelectedVoice(englishVoice.name);
      }
    };

    // Chrome loads voices asynchronously
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
    
    loadVoices();
  }, []);

  useEffect(() => {
    if (text) {
      const processedWords = text.split(/\s+/).filter(word => word.length > 0);
      setWords(processedWords);
    }
  }, [text]);

  const getEffectiveSpeed = (speed: number) => {
    if (speed >= 0.4) return speed;
    return 0.4; // Minimum speed for words
  };

  const getPauseDuration = (word: string, speed: number) => {
    if (speed >= 0.4) return 0;
    
    // Base pause is now much longer for slower speeds
    const basePause = (0.4 - speed) * 3000; // Increased from 1000 to 3000
    
    // Longer pauses for punctuation
    if (word.endsWith('.')) return basePause * 3; // Increased from 2 to 3
    if (word.endsWith('!')) return basePause * 3;
    if (word.endsWith('?')) return basePause * 3;
    if (word.endsWith(',')) return basePause * 2; // Increased from 1.5 to 2
    if (word.endsWith(';')) return basePause * 2;
    if (word.endsWith(':')) return basePause * 2;
    
    return basePause;
  };

  const speakWord = async (word: string, index: number) => {
    if (!speechRef.current) {
      speechRef.current = window.speechSynthesis;
    }

    return new Promise<void>((resolve) => {
      const utterance = new SpeechSynthesisUtterance(word);
      utterance.rate = getEffectiveSpeed(speed);
      
      // Set the selected voice
      const voice = voices.find(v => v.name === selectedVoice);
      if (voice) {
        utterance.voice = voice;
      }
      
      utterance.onend = () => {
        resolve();
      };

      utterance.onerror = () => {
        console.error('Speech synthesis error');
        resolve();
      };

      // Cancel any ongoing speech before starting new one
      speechRef.current?.cancel();
      speechRef.current?.speak(utterance);
    });
  };

  const togglePlay = async () => {
    if (!text || words.length === 0) return;

    try {
      if (isPlaying) {
        // Pause
        isPausedRef.current = true;
        if (speechRef.current) {
          speechRef.current.cancel();
        }
        setIsPlaying(false);
      } else {
        // Play
        isPausedRef.current = false;
        
        // If we're paused, continue from current word, otherwise start from beginning
        const startIndex = currentWordIndex >= 0 ? currentWordIndex : 0;
        
        // Set states before starting playback
        setIsPlaying(true);
        setCurrentWordIndex(startIndex);
        currentIndexRef.current = startIndex;
        
        // Ensure we're at the start of the text when starting fresh
        if (startIndex === 0 && textRef.current) {
          textRef.current.scrollTo({ top: 0, behavior: 'smooth' });
        }
        
        // Start playback immediately
        await processWords(startIndex);
      }
    } catch (error) {
      console.error('Error in togglePlay:', error);
      setIsPlaying(false);
      setCurrentWordIndex(-1);
      currentIndexRef.current = -1;
    }
  };

  const processWords = async (startIndex: number) => {
    if (!isPlaying || isPausedRef.current) return;

    try {
      for (let i = startIndex; i < words.length; i++) {
        if (!isPlaying || isPausedRef.current) {
          currentIndexRef.current = i;
          return;
        }

        setCurrentWordIndex(i);
        const word = words[i];
        await speakWord(word, i);
        
        const pauseDuration = getPauseDuration(word, speed);
        if (pauseDuration > 0) {
          await new Promise(resolve => setTimeout(resolve, pauseDuration));
        }
      }

      if (isPlaying) {
        setIsPlaying(false);
        setCurrentWordIndex(-1);
        currentIndexRef.current = -1;
      }
    } catch (error) {
      console.error('Error in processWords:', error);
      setIsPlaying(false);
      setCurrentWordIndex(-1);
      currentIndexRef.current = -1;
    }
  };

  const handleWordClick = (index: number) => {
    // Stop current speech if any
    if (speechRef.current) {
      speechRef.current.cancel();
    }
    
    // Update current word
    setCurrentWordIndex(index);
    currentIndexRef.current = index;
    isPausedRef.current = false;
    
    // Start playing from the clicked word
    setIsPlaying(true);
    processWords(index);
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      let extractedText = '';
      
      if (file.type === 'application/pdf') {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          extractedText += textContent.items.map((item: any) => item.str).join(' ') + '\n';
        }
      } else if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        extractedText = result.value;
      } else if (file.type === 'text/plain') {
        extractedText = await file.text();
      }

      // Reset speech synthesis state
      if (speechRef.current) {
        speechRef.current.cancel();
      }
      utteranceRef.current = null;
      setText(extractedText);
      setCurrentWordIndex(-1);
      currentIndexRef.current = -1;
      isPausedRef.current = false;
      setIsPlaying(false);

      // Scroll to top when new text is loaded
      if (textRef.current) {
        textRef.current.scrollTo({ top: 0, behavior: 'smooth' });
      }
    } catch (error) {
      console.error('Error processing file:', error);
      alert('Error processing file. Please try again.');
    }
  };

  const handleUrlSubmit = async () => {
    if (!url) return;

    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const file = new File([blob], 'document', { type: blob.type });
      
      const event = { target: { files: [file] } } as any;
      await handleFileUpload(event);
    } catch (error) {
      console.error('Error fetching URL:', error);
      alert('Error fetching URL. Please check the URL and try again.');
    }
  };

  const handleSpeedChange = (_: Event, newValue: number | number[]) => {
    const newSpeed = newValue as number;
    setSpeed(newSpeed);
  };

  return (
    <ThemeProvider theme={theme}>
      <Box
        sx={{
          minHeight: '100vh',
          background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)',
          py: 4,
          position: 'relative',
          overflow: 'hidden',
          '&::before': {
            content: '""',
            position: 'absolute',
            top: '-10%',
            right: '-10%',
            width: '40%',
            height: '40%',
            background: 'radial-gradient(circle, rgba(37, 99, 235, 0.1) 0%, rgba(37, 99, 235, 0) 70%)',
            borderRadius: '50%',
            zIndex: 0,
          },
          '&::after': {
            content: '""',
            position: 'absolute',
            bottom: '-10%',
            left: '-10%',
            width: '30%',
            height: '30%',
            background: 'radial-gradient(circle, rgba(37, 99, 235, 0.08) 0%, rgba(37, 99, 235, 0) 70%)',
            borderRadius: '50%',
            zIndex: 0,
          },
        }}
      >
        <Container maxWidth="md" sx={{ position: 'relative', zIndex: 1 }}>
          <Stack spacing={4}>
            <Box
              sx={{
                textAlign: 'center',
                mb: 2,
                position: 'relative',
              }}
            >
              <Box
                sx={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  width: '200px',
                  height: '200px',
                  background: 'radial-gradient(circle, rgba(37, 99, 235, 0.05) 0%, rgba(37, 99, 235, 0) 70%)',
                  borderRadius: '50%',
                  zIndex: -1,
                }}
              />
              <Typography 
                variant="h2" 
                component="h1"
                sx={{ 
                  background: 'linear-gradient(45deg, #2563eb, #1d4ed8)',
                  backgroundClip: 'text',
                  WebkitBackgroundClip: 'text',
                  color: 'transparent',
                  fontWeight: 800,
                  letterSpacing: '-0.03em',
                  mb: 2,
                  fontSize: { xs: '2.5rem', md: '3.5rem' },
                }}
              >
                Verbalise
              </Typography>
              <Typography 
                variant="subtitle1" 
                color="text.secondary"
                sx={{ 
                  fontWeight: 500,
                  letterSpacing: '0.01em',
                  maxWidth: '700px',
                  mx: 'auto',
                  fontSize: { xs: '1rem', md: '1.1rem' },
                }}
              >
                Listen as you write — AI-powered reading that lets you take notes without looking back. Adjust the pace and voice to fit your flow.
              </Typography>
            </Box>
            
            <Paper 
              elevation={0}
              sx={{ 
                p: 4,
                background: 'rgba(255, 255, 255, 0.9)',
                backdropFilter: 'blur(20px)',
                border: '1px solid rgba(255, 255, 255, 0.3)',
                position: 'relative',
                overflow: 'hidden',
                '&::before': {
                  content: '""',
                  position: 'absolute',
                  top: 0,
                  right: 0,
                  width: '150px',
                  height: '150px',
                  background: 'linear-gradient(45deg, rgba(37, 99, 235, 0.05), rgba(37, 99, 235, 0))',
                  borderRadius: '0 0 0 100%',
                },
              }}
            >
              <Stack spacing={3}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <Upload sx={{ color: 'primary.main', fontSize: 28 }} />
                  <Typography variant="h6" sx={{ fontWeight: 600 }}>Import Document</Typography>
                </Box>

                <Button
                  variant="outlined"
                  component="label"
                  startIcon={<Upload />}
                  size="large"
                  fullWidth
                  sx={{
                    height: 48,
                    borderColor: 'rgba(37, 99, 235, 0.2)',
                    '&:hover': {
                      borderColor: 'primary.main',
                      background: 'rgba(37, 99, 235, 0.04)',
                    },
                  }}
                >
                  Upload File
                  <input
                    type="file"
                    hidden
                    accept=".pdf,.doc,.docx,.txt"
                    onChange={handleFileUpload}
                  />
                </Button>
              </Stack>
            </Paper>

            <Paper 
              elevation={0}
              sx={{ 
                p: 4,
                background: 'rgba(255, 255, 255, 0.9)',
                backdropFilter: 'blur(20px)',
                border: '1px solid rgba(255, 255, 255, 0.3)',
                position: 'relative',
                overflow: 'hidden',
                '&::before': {
                  content: '""',
                  position: 'absolute',
                  top: 0,
                  right: 0,
                  width: '150px',
                  height: '150px',
                  background: 'linear-gradient(45deg, rgba(37, 99, 235, 0.05), rgba(37, 99, 235, 0))',
                  borderRadius: '0 0 0 100%',
                },
              }}
            >
              <Stack spacing={3}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <VolumeUp sx={{ color: 'primary.main', fontSize: 28 }} />
                  <Typography variant="h6" sx={{ fontWeight: 600 }}>Voice Settings</Typography>
                </Box>
                
                <FormControl fullWidth>
                  <InputLabel>Select Voice</InputLabel>
                  <Select
                    value={selectedVoice}
                    label="Select Voice"
                    onChange={(e) => setSelectedVoice(e.target.value)}
                    sx={{
                      '& .MuiOutlinedInput-notchedOutline': {
                        borderColor: 'rgba(37, 99, 235, 0.2)',
                      },
                      '&:hover .MuiOutlinedInput-notchedOutline': {
                        borderColor: 'primary.main',
                      },
                    }}
                  >
                    {voices.map((voice) => (
                      <MenuItem 
                        key={`${voice.name}-${voice.lang}-${voice.voiceURI}`} 
                        value={voice.name}
                      >
                        {voice.name} ({voice.lang})
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>

                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <Speed sx={{ color: 'primary.main', fontSize: 28 }} />
                  <Typography variant="h6" sx={{ fontWeight: 600 }}>Reading Speed</Typography>
                </Box>
                <Slider
                  value={speed}
                  onChange={handleSpeedChange}
                  min={0.05}
                  max={1}
                  step={0.05}
                  marks={[
                    { value: 0.05, label: '0.05x' },
                    { value: 0.1, label: '0.1x' },
                    { value: 0.2, label: '0.2x' },
                    { value: 0.4, label: '0.4x' },
                    { value: 0.6, label: '0.6x' },
                    { value: 0.8, label: '0.8x' },
                    { value: 1, label: '1x' },
                  ]}
                  valueLabelDisplay="auto"
                  valueLabelFormat={(value) => `${value}x`}
                  sx={{
                    '& .MuiSlider-thumb': {
                      width: 20,
                      height: 20,
                      boxShadow: '0 2px 8px rgba(37, 99, 235, 0.2)',
                      '&:hover': {
                        boxShadow: '0 4px 12px rgba(37, 99, 235, 0.3)',
                      },
                    },
                    '& .MuiSlider-track': {
                      height: 4,
                    },
                    '& .MuiSlider-rail': {
                      height: 4,
                      opacity: 0.2,
                    },
                    '& .MuiSlider-mark': {
                      width: 2,
                      height: 2,
                      '&.MuiSlider-markActive': {
                        background: 'primary.main',
                      },
                    },
                  }}
                />
                {speed < 0.4 && (
                  <Typography 
                    variant="caption" 
                    color="text.secondary"
                    sx={{ 
                      display: 'block',
                      textAlign: 'center',
                      mt: 1,
                      fontStyle: 'italic',
                    }}
                  >
                    Word speed is maintained at 0.4x for clarity, with longer pauses between words for better note-taking
                  </Typography>
                )}
              </Stack>
            </Paper>

            <Paper 
              elevation={0}
              sx={{ 
                p: 4,
                background: 'rgba(255, 255, 255, 0.9)',
                backdropFilter: 'blur(20px)',
                border: '1px solid rgba(255, 255, 255, 0.3)',
                maxHeight: '400px',
                overflow: 'auto',
                position: 'relative',
                '&::before': {
                  content: '""',
                  position: 'absolute',
                  bottom: 0,
                  left: 0,
                  width: '150px',
                  height: '150px',
                  background: 'linear-gradient(225deg, rgba(37, 99, 235, 0.05), rgba(37, 99, 235, 0))',
                  borderRadius: '100% 0 0 0',
                },
              }}
            >
              {!isPlaying && words.length > 0 && (
                <Box
                  sx={{
                    position: 'fixed',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    textAlign: 'center',
                    zIndex: 1,
                    pointerEvents: 'none',
                    color: 'text.secondary',
                    background: 'rgba(255, 255, 255, 0.9)',
                    padding: '12px 24px',
                    borderRadius: '12px',
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.05)',
                    backdropFilter: 'blur(8px)',
                    border: '1px solid rgba(37, 99, 235, 0.1)',
                    width: 'fit-content',
                    maxWidth: '90%',
                  }}
                >
                  <Typography variant="body1" sx={{ fontWeight: 500, mb: 0.5 }}>
                    Click any word once to select the word.
                  </Typography>
                  <Typography variant="body1" sx={{ opacity: 0.8 }}>
                    <b>Click again</b> to start reading from the selected word.
                  </Typography>
                </Box>
              )}
              <Box
                ref={textRef}
                sx={{
                  lineHeight: 1.8,
                  fontSize: '1.1rem',
                  position: 'relative',
                  '& span': {
                    cursor: 'pointer',
                    padding: '0 2px',
                    borderRadius: '4px',
                    transition: 'all 0.2s ease',
                    '&:hover': {
                      background: 'rgba(37, 99, 235, 0.1)',
                    },
                  },
                  '& .current-word': {
                    background: 'rgba(37, 99, 235, 0.15)',
                    color: 'primary.main',
                    fontWeight: 600,
                  },
                }}
              >
                {words.map((word, index) => (
                  <span
                    key={index}
                    id={`word-${index}`}
                    className={index === currentWordIndex ? 'current-word' : ''}
                    onClick={() => handleWordClick(index)}
                  >
                    {word}{' '}
                  </span>
                ))}
              </Box>
            </Paper>

            <Box 
              sx={{ 
                display: 'flex', 
                justifyContent: 'center', 
                gap: 2,
                position: 'fixed',
                bottom: 24,
                left: 0,
                right: 0,
                zIndex: 1000,
                pointerEvents: 'none',
                '& > *': {
                  pointerEvents: 'auto',
                },
                opacity: isPlaying ? 1 : 0,
                transform: `translateY(${isPlaying ? '0' : '20px'})`,
                transition: 'all 0.3s ease',
              }}
            >
              <Tooltip 
                title="Pause"
                TransitionComponent={Fade}
                TransitionProps={{ timeout: 200 }}
              >
                <IconButton
                  color="primary"
                  onClick={togglePlay}
                  size="large"
                  sx={{
                    width: 72,
                    height: 72,
                    background: 'var(--primary-color)',
                    color: 'white',
                    boxShadow: '0 4px 12px rgba(37, 99, 235, 0.2)',
                    '&:hover': {
                      background: 'var(--primary-hover)',
                      transform: 'translateY(-2px)',
                      boxShadow: '0 6px 16px rgba(37, 99, 235, 0.3)',
                    },
                    transition: 'all 0.2s ease',
                  }}
                >
                  <Pause sx={{ fontSize: 32 }} />
                </IconButton>
              </Tooltip>
            </Box>
          </Stack>
        </Container>
      </Box>
    </ThemeProvider>
  );
}

export default App;
