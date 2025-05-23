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
    },
    background: {
      default: '#f8fafc',
      paper: '#ffffff',
    },
  },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
    h3: {
      fontWeight: 600,
    },
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          borderRadius: '8px',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          borderRadius: '12px',
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
        setIsPlaying(true);
        
        // Start from current word if exists, otherwise from beginning
        const startIndex = currentWordIndex >= 0 ? currentWordIndex : 0;
        currentIndexRef.current = startIndex;
        setCurrentWordIndex(startIndex);
        processWords(startIndex);
      }
    } catch (error) {
      console.error('Error in togglePlay:', error);
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
        }}
      >
        <Container maxWidth="md">
          <Stack spacing={4}>
            <Box
              sx={{
                textAlign: 'center',
                mb: 2,
              }}
            >
              <Typography 
                variant="h2" 
                component="h1"
                sx={{ 
                  background: 'linear-gradient(45deg, #2563eb, #1d4ed8)',
                  backgroundClip: 'text',
                  WebkitBackgroundClip: 'text',
                  color: 'transparent',
                  fontWeight: 800,
                  letterSpacing: '-0.02em',
                  mb: 1,
                }}
              >
                Verbalise
              </Typography>
              <Typography 
                variant="subtitle1" 
                color="text.secondary"
                sx={{ 
                  fontWeight: 500,
                  letterSpacing: '0.02em',
                }}
              >
                Transform your documents into natural speech
              </Typography>
            </Box>
            
            <Paper 
              elevation={0}
              sx={{ 
                p: 3,
                background: 'rgba(255, 255, 255, 0.8)',
                backdropFilter: 'blur(10px)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
              }}
            >
              <Stack spacing={3}>
                <TextField
                  fullWidth
                  label="Enter PDF URL"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  variant="outlined"
                />
                <Stack direction="row" spacing={2}>
                  <Button
                    variant="contained"
                    onClick={handleUrlSubmit}
                    startIcon={<Upload />}
                    size="large"
                    fullWidth
                  >
                    Load from URL
                  </Button>

                  <Button
                    variant="outlined"
                    component="label"
                    startIcon={<Upload />}
                    size="large"
                    fullWidth
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
              </Stack>
            </Paper>

            <Paper 
              elevation={0}
              sx={{ 
                p: 3,
                background: 'rgba(255, 255, 255, 0.8)',
                backdropFilter: 'blur(10px)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
              }}
            >
              <Stack spacing={3}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <VolumeUp color="primary" />
                  <Typography>Voice Settings</Typography>
                </Box>
                
                <FormControl fullWidth>
                  <InputLabel>Select Voice</InputLabel>
                  <Select
                    value={selectedVoice}
                    label="Select Voice"
                    onChange={(e) => setSelectedVoice(e.target.value)}
                  >
                    {voices.map((voice) => (
                      <MenuItem key={voice.name} value={voice.name}>
                        {voice.name} ({voice.lang})
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>

                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Speed color="primary" />
                  <Typography>Reading Speed</Typography>
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
                      width: 16,
                      height: 16,
                    },
                  }}
                />
                {speed < 0.4 && (
                  <Typography variant="caption" color="text.secondary">
                    Word speed is maintained at 0.4x, with longer pauses between words for better note-taking
                  </Typography>
                )}
              </Stack>
            </Paper>

            <Paper 
              elevation={0}
              sx={{ 
                p: 3,
                background: 'rgba(255, 255, 255, 0.8)',
                backdropFilter: 'blur(10px)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                maxHeight: '400px',
                overflow: 'auto',
              }}
            >
              <Box
                ref={textRef}
                sx={{
                  lineHeight: 1.8,
                  fontSize: '1.1rem',
                  '& span': {
                    cursor: 'pointer',
                    padding: '0 2px',
                    borderRadius: '4px',
                    transition: 'all 0.2s ease',
                    '&:hover': {
                      background: 'var(--highlight)',
                    },
                  },
                  '& .current-word': {
                    background: 'var(--highlight)',
                    color: 'var(--current-word)',
                    fontWeight: 500,
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
                position: 'sticky',
                bottom: 20,
                zIndex: 1000,
              }}
            >
              <Tooltip 
                title={isPlaying ? "Pause" : "Play"}
                TransitionComponent={Fade}
                TransitionProps={{ timeout: 200 }}
              >
                <IconButton
                  color="primary"
                  onClick={togglePlay}
                  size="large"
                  sx={{
                    width: 64,
                    height: 64,
                    background: 'var(--primary-color)',
                    color: 'white',
                    boxShadow: '0 4px 12px rgba(37, 99, 235, 0.2)',
                    '&:hover': {
                      background: 'var(--primary-hover)',
                      transform: 'translateY(-2px)',
                    },
                    transition: 'all 0.2s ease',
                  }}
                >
                  {isPlaying ? <Pause /> : <PlayArrow />}
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
