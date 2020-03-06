
#pragma warning(push, 0)    
// Clang includes
#include <clang/AST/ASTConsumer.h>
#include <clang/AST/ASTContext.h>
#include <clang/AST/RecursiveASTVisitor.h>
#include <clang/AST/RecordLayout.h>
#include <clang/Analysis/CFG.h>
#include <clang/Basic/Diagnostic.h>
#include <clang/Basic/LangOptions.h>
#include <clang/Frontend/CompilerInstance.h>
#include <clang/Frontend/FrontendAction.h>
#include <clang/Tooling/CommonOptionsParser.h>
#include <clang/Tooling/Tooling.h>

// LLVM includes
#include <llvm/ADT/StringRef.h>
#include <llvm/Support/CommandLine.h>
#include <llvm/Support/raw_ostream.h>

#pragma warning(pop)    

namespace See 
{
    namespace Helpers
    {
        inline bool IsMSLayout(const clang::ASTContext& context) { return context.getTargetInfo().getCXXABI().isMicrosoft(); }
    }

    /////////////////////////////////////////////////////////////////////////////////////////////////////////////
    //Report types

    enum class ENodeNature
    {
        Root = 0,
        SimpleField,
        Bitfield,
        ComplexField,
        VPrimaryBase,
        VBase,
        NVPrimaryBase,
        NVBase,
        VTablePtr,
        VFTablePtr,
        VBTablePtr,
        VtorDisp,
    };

    // ----------------------------------------------------------------------------------------------------------
    using TAmount = clang::CharUnits::QuantityType;

    // ----------------------------------------------------------------------------------------------------------
    struct LayoutNode
    { 
        LayoutNode():nature(ENodeNature::Root),offset(0u),size(1u),align(1u){}
        ~LayoutNode() { for(LayoutNode* child : children) { delete child; } }        

        std::string  name;
        std::string  type;
        TAmount      offset;
        TAmount      size;
        TAmount      align;
        ENodeNature  nature;

        std::vector<LayoutNode*> children;
    };

    // ----------------------------------------------------------------------------------------------------------
    struct FullLayout
    {        
        //TODO ~ Ramonv ~ ideas for extra information
        //store interesting properties ( like is part of a container ) 
        //store file? 

        LayoutNode* root;
    };

    // ----------------------------------------------------------------------------------------------------------
    class SLayouts
    { 
	private: 
		using TContainer = std::map<std::string, FullLayout>;

    public:

        void ComputeLayout(const clang::ASTContext& context, const clang::CXXRecordDecl* declaration)
        {
            if (!declaration) return;

			//Get name 
			const std::string name = declaration->getQualifiedNameAsString(); 

			TContainer::iterator found = m_layouts.find(name);
			if (found == m_layouts.end())
			{
				FullLayout layout;
				layout.root = ComputeStruct(context, declaration, true);
				m_layouts[name] = layout;
			}
        }
   
		std::string DumpJson() const
		{
			std::string output;

			output += "[";

			bool first = true;
			for (const auto& layout : m_layouts)
			{
				if (!first) output += ',';
				//output += "{\"l\":";
				AppendJson(output,layout.second.root);
				//TODO ~ ramonv ~ add here more information from the struct itself
				//output += "}";
				first = false;
			}

			output += "]";

			return output;
		}

		std::string DumpHuman() const
		{
			std::string output; 

			for (const auto& layout : m_layouts)
			{
				output += "-----------------------------------------------------\n";
				AppendHuman(output,layout.second.root, 0, 0);
			}

			return output; 
		}

    private:

		void AppendJson(std::string& output, const LayoutNode* node) const
		{
			output += "{";

			if (!node->type.empty()) output += "\"t\":\"" + node->type+ "\",";
			if (!node->name.empty()) output += "\"l\":\"" + node->name+ "\",";

			if (node->offset) output += "\"o\":" + std::to_string(node->offset) + ",";

			output += "\"s\":" + std::to_string(node->size)   + ",";
			output += "\"a\":" + std::to_string(node->align)  + ",";
			output += "\"n\":" + std::to_string(static_cast<std::underlying_type<ENodeNature>::type>(node->nature)); 

			if (!node->children.empty())
			{
				output += ",\"c\":[";

				bool first = true;
				for (const LayoutNode* child : node->children)
				{
					if (!first) output += ',';
					AppendJson(output, child);
					first = false;
				}

				output += "]";
			}

			output += "}";
		}

        void AppendHuman(std::string& output, const LayoutNode* node, const TAmount offset, const int indent) const
        {
            const TAmount thisOffset = offset + node->offset;

            output += std::to_string(thisOffset);
            if (thisOffset < 10)   output += " ";
            if (thisOffset < 100)  output += " ";
			if (thisOffset < 1000) output += " ";
            output += "| ";

            for (int i=0;i<indent;++i) output += "  ";

            std::string name = node->type + " " + node->name;
            
            switch(node->nature)
            {
            case ENodeNature::VTablePtr:  name = "vtable pointer";  break;
            case ENodeNature::VFTablePtr: name = "vftable pointer"; break;
            case ENodeNature::VBTablePtr: name = "vbtable pointer"; break;
            case ENodeNature::VtorDisp:   name = "vtorDisp";        break;
            default: break;
            }

			output += name + " ( size: " + std::to_string(node->size) + " | align: " + std::to_string(node->align) + ")\n";

            for (const LayoutNode* child : node->children)
            {
                AppendHuman(output,child,thisOffset,indent+1);
            }
        }

        LayoutNode* ComputeStruct(const clang::ASTContext& context, const clang::CXXRecordDecl* declaration, const bool includeVirtualBases)
        {
            LayoutNode* node = new LayoutNode();

            const clang::ASTRecordLayout& layout = context.getASTRecordLayout(declaration);

            //basic data
            node->type   = declaration->getQualifiedNameAsString();
            node->size   = layout.getSize().getQuantity(); 
            node->align  = layout.getAlignment().getQuantity();

            //Check for bases 

            const clang::CXXRecordDecl* primaryBase = layout.getPrimaryBase();

            if(declaration->isDynamicClass() && !primaryBase && !Helpers::IsMSLayout(context))
            {
                //vtable pointer
                LayoutNode* vPtrNode = new LayoutNode(); 
                vPtrNode->nature = ENodeNature::VTablePtr; 
                vPtrNode->offset = 0u; 
                vPtrNode->size   = context.toCharUnitsFromBits(context.getTargetInfo().getPointerWidth(0)).getQuantity(); 
                vPtrNode->align  = context.toCharUnitsFromBits(context.getTargetInfo().getPointerAlign(0)).getQuantity();
                node->children.push_back(vPtrNode);
            }
            else if(layout.hasOwnVFPtr())
            {
                //vftable pointer
                LayoutNode* vPtrNode = new LayoutNode();
                vPtrNode->nature = ENodeNature::VFTablePtr;
                vPtrNode->offset = 0u;
                vPtrNode->size   = context.toCharUnitsFromBits(context.getTargetInfo().getPointerWidth(0)).getQuantity();
                vPtrNode->align  = context.toCharUnitsFromBits(context.getTargetInfo().getPointerAlign(0)).getQuantity();
                node->children.push_back(vPtrNode);
            }

            //Collect nvbases
            clang::SmallVector<const clang::CXXRecordDecl *,4> bases;
            for(const clang::CXXBaseSpecifier &base : declaration->bases())
            {
                assert(!base.getType()->isDependentType() && "Cannot layout class with dependent bases.");

                if(!base.isVirtual())
                {
                    bases.push_back(base.getType()->getAsCXXRecordDecl());
                }
            }

            // Sort nvbases by offset.
            llvm::stable_sort(bases,[&](const clang::CXXRecordDecl* lhs,const clang::CXXRecordDecl* rhs){ return layout.getBaseClassOffset(lhs) < layout.getBaseClassOffset(rhs); });

            // compute nvbases
            for(const clang::CXXRecordDecl* base : bases)
            {
                LayoutNode* baseNode = ComputeStruct(context,base,false); 
                baseNode->offset = layout.getBaseClassOffset(base).getQuantity();
                baseNode->nature = base == primaryBase? ENodeNature::NVPrimaryBase : ENodeNature::NVBase;
                node->children.push_back(baseNode);
            }

            // vbptr (for Microsoft C++ ABI)
            if(layout.hasOwnVBPtr())
            {                
                //vbtable pointer
                LayoutNode* vPtrNode = new LayoutNode();
                vPtrNode->nature = ENodeNature::VBTablePtr;
                vPtrNode->offset = layout.getVBPtrOffset().getQuantity();
                vPtrNode->size   = context.getTargetInfo().getPointerWidth(0);
                vPtrNode->align  = context.getTargetInfo().getPointerAlign(0);
                node->children.push_back(vPtrNode);
            }

            //Check for fields 
            unsigned int fieldNo = 0;
            for(clang::RecordDecl::field_iterator I = declaration->field_begin(),E = declaration->field_end(); I != E; ++I,++fieldNo)
            {
                const clang::FieldDecl& field = **I;
                const uint64_t localFieldOffsetInBits = layout.getFieldOffset(fieldNo);
                const clang::CharUnits fieldOffset = context.toCharUnitsFromBits(localFieldOffsetInBits);

                // Recursively visit fields of record type.
                if (const clang::CXXRecordDecl* fieldDeclarationCXX = field.getType()->getAsCXXRecordDecl())
                {
                    LayoutNode* fieldNode = ComputeStruct(context,fieldDeclarationCXX,true);
                    fieldNode->name   = field.getNameAsString();
                    fieldNode->type   = field.getType().getAsString(); //check if this or qualified types form function is better
                    fieldNode->offset = fieldOffset.getQuantity();
                    fieldNode->nature = ENodeNature::ComplexField;
                    node->children.push_back(fieldNode);
                }
                else
                {
                    if(field.isBitField())
                    {
                        //field.getType().getAsString() //Field type 
                        //field.getNameAsString(); //field name
                        //uint64_t localFieldByteOffsetInBits = m_context->toBits(fieldOffset - offset);
                        //unsigned Begin = localFieldOffsetInBits - localFieldByteOffsetInBits;
                        //unsigned Width = field.getBitWidthValue(*m_context);

                        //TODO ~ ramonv ~ output bitfield

                        //PrintBitFieldOffset(OS,FieldOffset,Begin,Width,IndentLevel);
                    }
                    else
                    {
                        const clang::TypeInfo fieldInfo = context.getTypeInfo(field.getType());

                        //simple field
                        LayoutNode* fieldNode = new LayoutNode();
                        fieldNode->name   = field.getNameAsString(); 
                        fieldNode->type   = field.getType().getAsString();

                        fieldNode->nature = ENodeNature::SimpleField;
                        fieldNode->offset = fieldOffset.getQuantity();
                        fieldNode->size   = context.toCharUnitsFromBits(fieldInfo.Width).getQuantity();
                        fieldNode->align  = context.toCharUnitsFromBits(fieldInfo.Align).getQuantity();
                        node->children.push_back(fieldNode);
                    }
                }
            }

            //Virtual bases
            if(includeVirtualBases)
            {
                const clang::ASTRecordLayout::VBaseOffsetsMapTy &vtorDisps = layout.getVBaseOffsetsMap();
                for(const clang::CXXBaseSpecifier& Base : declaration->vbases())
                {
                    assert(Base.isVirtual() && "Found non-virtual class!");

                    const clang::CXXRecordDecl* vBase = Base.getType()->getAsCXXRecordDecl();
                    const clang::CharUnits vBaseOffset = layout.getVBaseClassOffset(vBase);

                    if(vtorDisps.find(vBase)->second.hasVtorDisp())
                    {
                        clang::CharUnits size = clang::CharUnits::fromQuantity(4);

                        LayoutNode* vtorDispNode = new LayoutNode();
                        vtorDispNode->nature = ENodeNature::VtorDisp;
                        vtorDispNode->offset = (vBaseOffset - size).getQuantity();
                        vtorDispNode->size   = size.getQuantity();
                        vtorDispNode->align  = size.getQuantity();
                        node->children.push_back(vtorDispNode);
                    }

                    LayoutNode* vBaseNode = ComputeStruct(context,vBase,false);
                    vBaseNode->offset = vBaseOffset.getQuantity();
                    vBaseNode->nature = vBase == primaryBase? ENodeNature::VPrimaryBase : ENodeNature::VBase;
                    node->children.push_back(vBaseNode);
                }
            }

            return node;
        }

    private:
        TContainer m_layouts; 
    };

    SLayouts g_layouts;

    /////////////////////////////////////////////////////////////////////////////////////////////////////////////

    class FindClassVisitor : public clang::RecursiveASTVisitor<FindClassVisitor> 
    {
    public:
        FindClassVisitor():m_context(nullptr){}

        inline void SetContext(clang::ASTContext* context){ m_context = context; }

        bool VisitCXXRecordDecl(clang::CXXRecordDecl* declaration) 
		{
            //Declaration->dump();

            if ( declaration && ( declaration->isClass() || declaration->isStruct() ) && !declaration->isDependentType() )
            {
                g_layouts.ComputeLayout(*m_context,declaration);
            }

            return true;
        }
    private:
        clang::ASTContext* m_context; 
    };

    class Consumer : public clang::ASTConsumer 
    {
    public:
        virtual void HandleTranslationUnit(clang::ASTContext& context) override
        {
            m_visitor.SetContext(&context);
            m_visitor.TraverseDecl(context.getTranslationUnitDecl());
        }

     private:
         //TODO ~ ramonv ~ Add members 
         FindClassVisitor m_visitor;
    };

    class Action : public clang::ASTFrontendAction 
    {
    public:
        using ASTConsumerPointer = std::unique_ptr<clang::ASTConsumer>;
        ASTConsumerPointer CreateASTConsumer(clang::CompilerInstance&, llvm::StringRef) override { return std::make_unique<Consumer>(); }
    };
}  // namespace McCabe

namespace 
{
	//group
    llvm::cl::OptionCategory seeCategory("See++ Layout Options");
    llvm::cl::extrahelp SeeCategoryHelp(R"( Exports the struct/class memory layout )");

	//commands
	llvm::cl::opt<std::string> OutputFilename("output", llvm::cl::desc("Specify output filename"), llvm::cl::value_desc("filename"), llvm::cl::cat(seeCategory));
	llvm::cl::opt<bool>        HumanPrint("show", llvm::cl::desc("Prints the layouts in human readable form"), llvm::cl::cat(seeCategory));

	//aliases
	llvm::cl::alias ShortOutputFilenameOption("o",  llvm::cl::desc("Alias for -output"),  llvm::cl::aliasopt(OutputFilename));
	llvm::cl::alias ShortHumanPrintOption("s",     llvm::cl::desc("Alias for -show"), llvm::cl::aliasopt(HumanPrint));
} 

struct ToolFactory : public clang::tooling::FrontendActionFactory 
{
    std::unique_ptr<clang::FrontendAction> create() override { return std::make_unique<See::Action>(); }
};

int main(int argc, const char* argv[])
{
	clang::tooling::CommonOptionsParser optionsParser(argc, argv, seeCategory);
	clang::tooling::ClangTool tool(optionsParser.getCompilations(), optionsParser.getSourcePathList());

	const int retCode = tool.run(new ToolFactory());

	//Output result
	std::error_code error_code;
	llvm::raw_fd_ostream outFile(OutputFilename.empty() ? "output.see" : OutputFilename.c_str(), error_code, llvm::sys::fs::F_None);
	outFile << See::g_layouts.DumpJson();
	outFile.close();

	//Show debug commands
	if (HumanPrint)
	{
		llvm::outs() << See::g_layouts.DumpHuman();
	}

	return retCode;
}
