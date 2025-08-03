import React, { useState, useRef, useEffect } from 'react';
import { BookOpen, Target, UserCheck, List, Bot, FileText, Image as ImageIcon, Award, Sparkles, BrainCircuit, Send, Loader, ChevronDown, ChevronUp, Check, HelpCircle, RefreshCw, X, Settings, Volume2, Play, Pause } from 'lucide-react';

// --- New Quiz Modal Component ---
const QuizModal = ({ isOpen, onClose, content }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md relative">
                <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600">
                    <X size={24} />
                </button>
                <h3 className="text-lg font-bold text-slate-800 mb-2">Correct Answer</h3>
                <div className="p-4 bg-green-50 border border-green-200 rounded-lg mb-4">
                    <p className="font-semibold text-green-800">{content.correctAnswer}</p>
                </div>
                <h3 className="text-lg font-bold text-slate-800 mb-2">Rationale</h3>
                <p className="text-slate-600">{content.rationale}</p>
            </div>
        </div>
    );
};


// --- Main Application Component ---
export default function App() {
    // State to manage the user's input keyword
    const [keyword, setKeyword] = useState('');
    // State to hold the generated course content
    const [courseData, setCourseData] = useState(null);
    // State to manage the loading status
    const [isLoading, setIsLoading] = useState(false);
    // State for any potential errors
    const [error, setError] = useState('');
    // State to manage which sections of the course outline are expanded
    const [openSections, setOpenSections] = useState({});
    // State to provide specific feedback during generation
    const [loadingMessage, setLoadingMessage] = useState('');
    // State for the quiz modal
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [modalContent, setModalContent] = useState({ correctAnswer: '', rationale: '' });
    
    // --- States for Audio functionality ---
    const [audioProvider, setAudioProvider] = useState('browser'); // 'browser' or 'elevenlabs'
    const [elevenLabsApiKey, setElevenLabsApiKey] = useState('');
    const [elevenLabsVoiceId, setElevenLabsVoiceId] = useState('');
    const [showAudioSettings, setShowAudioSettings] = useState(false);
    const [audioLoading, setAudioLoading] = useState(null); // Tracks which lecture audio is loading
    const [audioPlaying, setAudioPlaying] = useState(null); // Tracks which lecture audio is playing
    const [audioVolume, setAudioVolume] = useState(1); // New state for volume control
    const audioRef = useRef(null); // To hold the audio object for ElevenLabs
    const utteranceRef = useRef(null); // To hold the utterance object for Browser TTS

    // --- Effect to update volume of currently playing audio ---
    useEffect(() => {
        if (audioRef.current) {
            audioRef.current.volume = audioVolume;
        }
        // Note: SpeechSynthesisUtterance volume cannot be changed mid-playback.
        // The new volume will be applied the next time the browser voice plays.
    }, [audioVolume]);


    // --- Function to reset the application state ---
    const handleStartOver = () => {
        setKeyword('');
        setCourseData(null);
        setIsLoading(false);
        setError('');
        setOpenSections({});
        setLoadingMessage('');
        // Stop any currently playing audio
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current = null;
        }
        window.speechSynthesis.cancel();
        setAudioLoading(null);
        setAudioPlaying(null);
    };

    // --- Modal Control Functions ---
    const openQuizModal = (content) => {
        setModalContent(content);
        setIsModalOpen(true);
    };

    const closeQuizModal = () => {
        setIsModalOpen(false);
    };

    // --- Core AI Generation Logic ---
    const generateCourse = async () => {
        if (!keyword) {
            setError('Please enter a topic keyword to begin.');
            return;
        }
        setIsLoading(true);
        setLoadingMessage('Generating course structure...');
        setError('');
        setCourseData(null);

        const initialPrompt = `
            You are CourseCatalyst AI, an expert instructional designer. Your task is to generate the foundational structure for a course based on the keyword(s): "${keyword}".
            Your response MUST be a single, valid JSON object with the following structure:
            {
              "title": "A catchy and compelling course title",
              "subtitle": "An engaging subtitle that clarifies the course promise",
              "description": "A witty, anecdotal, and humorous course description (2-3 paragraphs)",
              "learningObjectives": ["Objective 1 (<= 160 chars)", "Objective 2", "Objective 3", "Objective 4", "Objective 5"],
              "prerequisites": ["Prerequisite 1", "Prerequisite 2", "Prerequisite 3 (Max 4)"],
              "learnerProfile": "A description of the target audience",
              "courseImageBrief": "A description for a 750x422 pixel graphic",
              "sections": [
                {"sectionTitle": "Section 1 Title", "sectionDescription": "A clear description of the section's goals"},
                {"sectionTitle": "Section 2 Title", "sectionDescription": "A clear description of the section's goals"},
                {"sectionTitle": "Section 3 Title", "sectionDescription": "A clear description of the section's goals"},
                {"sectionTitle": "Section 4 Title", "sectionDescription": "A clear description of the section's goals"},
                {"sectionTitle": "Section 5 Title", "sectionDescription": "A clear description of the section's goals"}
              ]
            }
        `;

        try {
            const responseString = await runAIPromise(initialPrompt);
            if (responseString) {
                const jsonMatch = responseString.match(/\{[\s\S]*\}/);
                if (!jsonMatch) throw new Error("AI returned invalid structure format. Please try again.");

                const structure = JSON.parse(jsonMatch[0]);
                structure.sections = structure.sections.map(sec => ({ ...sec, lectures: null, assignment: null, isLoading: false, error: null }));
                setCourseData(structure);
                setOpenSections({ [structure.sections[0].sectionTitle]: true });
            }
        } catch (e) {
            setError(e.message);
        } finally {
            setIsLoading(false);
            setLoadingMessage('');
        }
    };
    
    const handleGenerateSingleSection = async (sectionIndex) => {
        const currentCourseData = { ...courseData };
        const section = currentCourseData.sections[sectionIndex];

        currentCourseData.sections[sectionIndex].isLoading = true;
        setCourseData({ ...currentCourseData });

        const sectionPrompt = `
            You are an expert instructional designer creating content for a course titled "${currentCourseData.title}".
            Your current task is to generate the content for ONLY this section:
            - Section Title: "${section.sectionTitle}"
            - Section Description: "${section.sectionDescription}"
            Your response MUST be a single, valid JSON object with the following structure:
            {
              "lectures": [
                {
                  "lectureTitle": "Lecture 1.1 Title (Unique and engaging)",
                  "lectureContent": "Informative, anecdotal, and humorous content for a 3-minute lecture.",
                  "quiz": { "question": "A multiple-choice question.", "answers": ["Answer A", "Answer B", "Correct Answer C"], "correctAnswerIndex": 2, "rationale": "An explanation." }
                }
              ],
              "assignment": "A practical, real-world assignment."
            }
        `;

        try {
            const sectionResponseString = await runAIPromise(sectionPrompt);
            if (!sectionResponseString) throw new Error("AI failed to generate section content.");
            
            const jsonMatch = sectionResponseString.match(/\{[\s\S]*\}/);
            if (!jsonMatch) throw new Error("AI returned invalid section format.");

            const sectionContent = JSON.parse(jsonMatch[0]);
            
            currentCourseData.sections[sectionIndex] = { ...section, ...sectionContent, isLoading: false };
            
        } catch (e) {
            console.error(`Error generating section ${sectionIndex + 1}:`, e);
            currentCourseData.sections[sectionIndex].isLoading = false;
            currentCourseData.sections[sectionIndex].error = `Error: Could not generate content. ${e.message}`;
        }
        setCourseData({ ...currentCourseData });
    };

    const runAIPromise = async (prompt) => {
        const apiKey = "";
        const maxRetries = 3;
        let delay = 1000;

        const payload = {
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: "application/json" }
        };

        for (let i = 0; i < maxRetries; i++) {
            try {
                // FIX: Updated the model to a different stable version to troubleshoot potential permission issues.
                const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (!response.ok) {
                    // FIX: Enhanced error handling to provide more specific feedback from the API response body.
                    let errorBody = {};
                    try {
                        errorBody = await response.json();
                    } catch (e) {
                        // Ignore if response is not JSON
                    }

                    if (response.status === 403) {
                        const message = errorBody?.error?.message || "This often means the API key is misconfigured.";
                        throw new Error(`API request failed with a 403 Forbidden error. ${message} Please check your key's restrictions in the Google Cloud Console.`);
                    }
                    if (response.status >= 500) {
                        throw new Error(`API request failed with server status ${response.status}`);
                    }
                    const errorText = errorBody?.error?.message || await response.text();
                    throw new Error(`API request failed with status ${response.status}: ${errorText}`);
                }

                const result = await response.json();
                if (result.candidates?.[0]?.content?.parts?.[0]?.text) {
                    return result.candidates[0].content.parts[0].text;
                } else {
                     if (result.promptFeedback?.blockReason) throw new Error(`AI prompt was blocked. Reason: ${result.promptFeedback.blockReason}. Please try rephrasing your input.`);
                    throw new Error("The AI returned an empty or invalid response.");
                }
            } catch (error) {
                console.error(`Attempt ${i + 1} failed:`, error);
                if (i === maxRetries - 1) throw new Error(`After multiple attempts, the AI failed to respond: ${error.message}`);
                await new Promise(res => setTimeout(res, delay));
                delay *= 2;
            }
        }
        return null;
    };

    // --- Unified Audio Play/Pause Function ---
    const handlePlayAudio = (lecture) => {
        const lectureId = lecture.lectureTitle;

        // Stop any currently playing audio
        if (audioRef.current) audioRef.current.pause();
        window.speechSynthesis.cancel();

        // If the clicked lecture is already playing, stop it
        if (audioPlaying === lectureId) {
            setAudioPlaying(null);
            return;
        }

        if (audioProvider === 'elevenlabs') {
            playElevenLabs(lecture);
        } else {
            playBrowserTTS(lecture);
        }
    };

    const playBrowserTTS = (lecture) => {
        const lectureId = lecture.lectureTitle;
        setAudioLoading(lectureId);
        
        const utterance = new SpeechSynthesisUtterance(lecture.lectureContent);
        utteranceRef.current = utterance;
        utterance.volume = audioVolume; // Apply volume
        
        utterance.onstart = () => {
            setAudioLoading(null);
            setAudioPlaying(lectureId);
        };
        
        utterance.onend = () => {
            setAudioPlaying(null);
            utteranceRef.current = null;
        };
        
        window.speechSynthesis.speak(utterance);
    };

    const playElevenLabs = async (lecture) => {
        const lectureId = lecture.lectureTitle;

        if (!elevenLabsApiKey || !elevenLabsVoiceId) {
            setError("Please enter your ElevenLabs API Key and Voice ID in the settings.");
            setShowAudioSettings(true);
            return;
        }
        
        setAudioLoading(lectureId);
        setError('');

        try {
            const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${elevenLabsVoiceId}`, {
                method: 'POST',
                headers: { 'Accept': 'audio/mpeg', 'Content-Type': 'application/json', 'xi-api-key': elevenLabsApiKey },
                body: JSON.stringify({
                    text: lecture.lectureContent,
                    model_id: 'eleven_multilingual_v2',
                    voice_settings: { stability: 0.5, similarity_boost: 0.75 },
                }),
            });

            if (!response.ok) {
                const errorBody = await response.json();
                console.error("ElevenLabs API Error:", errorBody);
                throw new Error(`ElevenLabs API request failed. Message: ${errorBody.detail?.message || 'Check console for details.'}`);
            }

            const audioBlob = await response.blob();
            const audioUrl = URL.createObjectURL(audioBlob);
            audioRef.current = new Audio(audioUrl);
            audioRef.current.volume = audioVolume; // Apply volume
            audioRef.current.play();
            setAudioPlaying(lectureId);
            audioRef.current.onended = () => setAudioPlaying(null);

        } catch (err) {
            setError(err.message);
        } finally {
            setAudioLoading(null);
        }
    };

    const toggleSection = (sectionTitle) => {
        setOpenSections(prev => ({ ...prev, [sectionTitle]: !prev[sectionTitle] }));
    };

    // --- Component for Displaying a Single Course Section ---
    const CourseSection = ({ section, isOpen, onToggle, onRevealAnswer, onGenerate, sectionIndex, handlePlayAudio, audioLoading, audioPlaying }) => (
        <div className="border border-slate-200 rounded-lg bg-white mb-4 transition-all duration-300">
            <button onClick={onToggle} className="w-full p-4 flex justify-between items-center text-left">
                <div className="flex items-center">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center mr-4 ${isOpen ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-600'}`}>
                        <BookOpen size={16} />
                    </div>
                    <div>
                        <h3 className="font-bold text-lg text-slate-800">{section.sectionTitle}</h3>
                        <p className="text-sm text-slate-500">{section.sectionDescription}</p>
                    </div>
                </div>
                {isOpen ? <ChevronUp className="text-slate-500" /> : <ChevronDown className="text-slate-500" />}
            </button>
            {isOpen && (
                <div className="p-4 border-t border-slate-200">
                    {section.isLoading ? (
                        <div className="flex items-center justify-center p-4">
                            <Loader className="animate-spin text-blue-500 mr-2" />
                            <span className="text-slate-500 font-medium">Generating content...</span>
                        </div>
                    ) : section.error ? (
                         <div className="text-red-600 p-3 bg-red-50 rounded-md">{section.error}</div>
                    ) : !section.lectures ? (
                        <div className="text-center p-4">
                            <button onClick={() => onGenerate(sectionIndex)} className="bg-blue-500 text-white font-semibold py-2 px-4 rounded-lg hover:bg-blue-600 transition-colors">
                                Generate Content for this Section
                            </button>
                        </div>
                    ) : (
                        <>
                            <div className="space-y-3">
                                {section.lectures && section.lectures.map((lecture, index) => (
                                    <div key={index} className="p-3 bg-slate-50 rounded-md">
                                        <div className="flex justify-between items-start">
                                            <div className="flex-grow">
                                                <p className="font-semibold text-slate-700">{lecture.lectureTitle}</p>
                                                <p className="text-sm text-slate-600 mt-1">{lecture.lectureContent}</p>
                                            </div>
                                            <button onClick={() => handlePlayAudio(lecture)} className="ml-4 p-2 text-slate-500 hover:text-blue-600 transition-colors">
                                                {audioLoading === lecture.lectureTitle ? <Loader className="animate-spin" size={20}/> : (audioPlaying === lecture.lectureTitle ? <Pause size={20}/> : <Play size={20}/>)}
                                            </button>
                                        </div>
                                        <div className="mt-2 text-sm">
                                            <div className="p-2 mt-1 bg-white rounded border">
                                                <p className="font-semibold">{lecture.quiz.question}</p>
                                                <ul className="list-disc pl-5 mt-1 space-y-1">
                                                    {lecture.quiz.answers.map((ans, ansIdx) => (
                                                        <li key={ansIdx}>{ans}</li>
                                                    ))}
                                                </ul>
                                                <button 
                                                    onClick={() => {
                                                        if (lecture.quiz && Array.isArray(lecture.quiz.answers) && lecture.quiz.answers.length > lecture.quiz.correctAnswerIndex) {
                                                            onRevealAnswer({
                                                                correctAnswer: lecture.quiz.answers[lecture.quiz.correctAnswerIndex],
                                                                rationale: lecture.quiz.rationale || 'No rationale provided.'
                                                            });
                                                        } else {
                                                            console.error("Malformed quiz data for lecture:", lecture.lectureTitle);
                                                            onRevealAnswer({
                                                                correctAnswer: "Error",
                                                                rationale: "The quiz data for this lecture appears to be missing or corrupted."
                                                            });
                                                        }
                                                    }}
                                                    className="text-sm font-semibold text-blue-600 hover:text-blue-800 mt-2">
                                                    Reveal Answer
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
                                <h4 className="font-bold text-blue-800">Real-World Assignment</h4>
                                <p className="text-sm text-blue-700 mt-1">{section.assignment}</p>
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );

    // --- Main Render Logic ---
    return (
        <div className="min-h-screen bg-slate-100 font-sans p-4 sm:p-6 md:p-8">
            <QuizModal isOpen={isModalOpen} onClose={closeQuizModal} content={modalContent} />
            <div className="max-w-5xl mx-auto">
                {/* Header */}
                <header className="flex justify-between items-start mb-8">
                    <div className="flex items-center gap-3">
                        <div className="bg-blue-600 p-2 rounded-lg text-white shadow-md"><BrainCircuit size={28}/></div>
                        <div>
                            <h1 className="text-3xl font-bold text-slate-800">CourseCatalyst AI</h1>
                            <p className="text-slate-500">From Keyword to Curriculum in Seconds</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        <button onClick={() => setShowAudioSettings(!showAudioSettings)} className="flex items-center gap-2 text-slate-500 hover:text-blue-600 transition-colors font-medium">
                            <Settings size={16} />
                            <span>Audio Settings</span>
                        </button>
                        <button onClick={handleStartOver} className="flex items-center gap-2 text-slate-500 hover:text-blue-600 transition-colors font-medium">
                            <RefreshCw size={16} />
                            <span>Start Over</span>
                        </button>
                    </div>
                </header>
                
                {/* Audio Settings Panel */}
                {showAudioSettings && (
                    <div className="bg-white p-6 rounded-xl shadow-lg border border-slate-200 mb-8">
                        <h2 className="text-xl font-bold text-slate-800 mb-3">Audio Settings</h2>
                        <div className="mb-4">
                            <p className="text-sm text-slate-500 mb-2">Choose your audio source.</p>
                            <div className="flex gap-4">
                                <label className="flex items-center gap-2 p-3 rounded-lg border has-[:checked]:bg-blue-50 has-[:checked]:border-blue-500 cursor-pointer"><input type="radio" name="audioProvider" value="browser" checked={audioProvider === 'browser'} onChange={() => setAudioProvider('browser')} /> Browser Voice (Default)</label>
                                <label className="flex items-center gap-2 p-3 rounded-lg border has-[:checked]:bg-blue-50 has-[:checked]:border-blue-500 cursor-pointer"><input type="radio" name="audioProvider" value="elevenlabs" checked={audioProvider === 'elevenlabs'} onChange={() => setAudioProvider('elevenlabs')} /> ElevenLabs (Custom)</label>
                            </div>
                        </div>

                        {audioProvider === 'elevenlabs' && (
                            <div className="mb-4">
                                <p className="text-sm text-slate-500 mb-4">Enter your ElevenLabs API Key and Voice ID.</p>
                                <div className="flex flex-col sm:flex-row gap-4">
                                    <input type="password" value={elevenLabsApiKey} onChange={(e) => setElevenLabsApiKey(e.target.value)} placeholder="Enter your ElevenLabs API Key" className="flex-grow p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
                                    <input type="text" value={elevenLabsVoiceId} onChange={(e) => setElevenLabsVoiceId(e.target.value)} placeholder="Enter your ElevenLabs Voice ID" className="flex-grow p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
                                </div>
                            </div>
                        )}
                        
                        {/* New Volume Control */}
                        <div>
                            <p className="text-sm text-slate-500 mb-2">Adjust Playback Volume</p>
                             <div className="flex items-center gap-3">
                                <Volume2 size={20} className="text-slate-500" />
                                <input 
                                    type="range" 
                                    min="0" 
                                    max="1" 
                                    step="0.1" 
                                    value={audioVolume} 
                                    onChange={(e) => setAudioVolume(parseFloat(e.target.value))}
                                    className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                                />
                            </div>
                        </div>
                    </div>
                )}


                {/* Input Section */}
                <div className="bg-white p-6 rounded-xl shadow-lg border border-slate-200 mb-8">
                    <div className="flex flex-col sm:flex-row gap-4">
                        <input
                            type="text"
                            value={keyword}
                            onChange={(e) => setKeyword(e.target.value)}
                            placeholder="Enter your course topic (e.g., 'Digital Marketing, SEO')"
                            className="flex-grow p-3 border border-slate-300 rounded-lg text-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            onKeyDown={(e) => e.key === 'Enter' && generateCourse()}
                        />
                        <button
                            onClick={generateCourse}
                            disabled={isLoading || !!loadingMessage}
                            className="bg-blue-600 text-white font-bold py-3 px-6 rounded-lg flex items-center justify-center gap-2 hover:bg-blue-700 transition-colors shadow-sm disabled:bg-slate-400 disabled:cursor-not-allowed"
                        >
                            {isLoading || loadingMessage ? <Loader className="animate-spin" /> : <Sparkles />}
                            <span>{isLoading || loadingMessage ? 'Generating...' : 'Generate Course'}</span>
                        </button>
                    </div>
                    {error && <p className="text-red-600 mt-2 text-sm p-3 bg-red-50 rounded-md">{error}</p>}
                </div>

                {/* Output Section */}
                {isLoading && (
                    <div className="text-center p-10">
                        <Loader className="animate-spin inline-block text-blue-600 mb-4" size={48} />
                        <p className="text-slate-600 font-semibold">{loadingMessage}</p>
                    </div>
                )}

                {courseData && (
                    <div className="space-y-8">
                        {/* Course Header */}
                        <div className="bg-white p-8 rounded-xl shadow-lg border border-slate-200 text-center">
                            <h2 className="text-4xl font-extrabold text-slate-900 tracking-tight">{courseData.title}</h2>
                            <p className="text-xl text-blue-600 font-medium mt-2">{courseData.subtitle}</p>
                            <p className="text-slate-600 mt-4 max-w-3xl mx-auto">{courseData.description}</p>
                        </div>

                        {/* Course Details Grid */}
                        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                            <div className="bg-white p-6 rounded-xl shadow-md border border-slate-200">
                                <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2 mb-2"><Target /> Learning Objectives</h3>
                                <ul className="list-disc pl-5 space-y-1 text-slate-600">
                                    {courseData.learningObjectives.map((obj, i) => <li key={i}>{obj}</li>)}
                                </ul>
                            </div>
                            <div className="bg-white p-6 rounded-xl shadow-md border border-slate-200">
                                <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2 mb-2"><UserCheck /> Who Should Take This Course?</h3>
                                <p className="text-slate-600">{courseData.learnerProfile}</p>
                            </div>
                            <div className="bg-white p-6 rounded-xl shadow-md border border-slate-200">
                                <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2 mb-2"><Check /> Prerequisites</h3>
                                <ul className="list-disc pl-5 space-y-1 text-slate-600">
                                    {courseData.prerequisites.map((req, i) => <li key={i}>{req}</li>)}
                                </ul>
                            </div>
                        </div>
                        
                        {/* Course Outline Section */}
                        <div>
                            <div className="flex justify-center items-center gap-2 mb-4">
                                <h2 className="text-3xl font-bold text-slate-800 text-center">Course Outline</h2>
                                {loadingMessage && <Loader className="animate-spin text-blue-500" />}
                            </div>
                            {courseData.sections.map((section, index) => (
                                <CourseSection
                                    key={index}
                                    section={section}
                                    isOpen={!!openSections[section.sectionTitle]}
                                    onToggle={() => toggleSection(section.sectionTitle)}
                                    onRevealAnswer={openQuizModal}
                                    onGenerate={handleGenerateSingleSection}
                                    sectionIndex={index}
                                    handlePlayAudio={handlePlayAudio}
                                    audioLoading={audioLoading}
                                    audioPlaying={audioPlaying}
                                />
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
